import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { Pool } from "pg";

const ROLLING_RETENTION_DAYS = 30;
const ROLLING_RETENTION_MS = ROLLING_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const AUDIT_ARCHIVE_RETENTION_YEARS = 7;
const AUDIT_ARCHIVE_RETENTION_MS =
  AUDIT_ARCHIVE_RETENTION_YEARS * 365 * 24 * 60 * 60 * 1000;
const AUDIT_ARCHIVE_DIRNAME = "7-year-retention";
const AUDIT_ARCHIVE_STATE_FILE = "audit-archive-state.json";

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = resolve(
  process.env.BACKUP_DIR ?? join(process.cwd(), "backups"),
);
const backupDir = join(backupRoot, timestamp);
const dbDumpPath = join(backupDir, "postgres.dump");
const filesSource = resolve(
  process.env.CMS_STORAGE_ROOT ?? join(process.cwd(), "storage", "private"),
);
const filesTarget = join(backupDir, "files");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for backup");
}

await mkdir(backupDir, { recursive: true });

await runPgDump(databaseUrl, dbDumpPath);
await copyFilesBackup(filesSource, filesTarget);
const auditArchive = await archiveAuditLogs({
  databaseUrl,
  backupRoot,
  backupDir,
  retentionLagMs: ROLLING_RETENTION_MS,
});
await cleanupOldBackups(backupRoot, ROLLING_RETENTION_MS);
await cleanupOldAuditArchives(
  join(backupRoot, AUDIT_ARCHIVE_DIRNAME),
  AUDIT_ARCHIVE_RETENTION_MS,
);

const metadata = {
  backupDir,
  dbDump: dbDumpPath,
  filesSnapshot: filesTarget,
  rollingRetentionDays: ROLLING_RETENTION_DAYS,
  auditArchiveRetentionYears: AUDIT_ARCHIVE_RETENTION_YEARS,
  auditArchive,
  completedAt: new Date().toISOString(),
};

process.stdout.write(`${JSON.stringify(metadata)}\n`);

async function runPgDump(
  connectionString: string,
  outputPath: string,
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        `--file=${outputPath}`,
        connectionString,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      },
    );

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      rejectPromise(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(`pg_dump failed with code ${code}: ${stderr.trim()}`),
      );
    });
  });
}

async function copyFilesBackup(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });

  await cp(source, target, {
    recursive: true,
    force: true,
    errorOnExist: false,
  }).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  });
}

async function cleanupOldBackups(
  root: string,
  retentionMs: number,
): Promise<void> {
  const now = Date.now();
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name === AUDIT_ARCHIVE_DIRNAME) {
      continue;
    }

    const fullPath = join(root, entry.name);
    const info = await stat(fullPath);
    if (now - info.mtimeMs <= retentionMs) {
      continue;
    }

    if (basename(fullPath) === basename(backupDir)) {
      continue;
    }

    await rm(fullPath, { recursive: true, force: true });
  }
}

async function archiveAuditLogs(input: {
  databaseUrl: string;
  backupRoot: string;
  backupDir: string;
  retentionLagMs: number;
}): Promise<{
  archivedRows: number;
  archiveFile: string | null;
  archivedFrom: string;
  archivedTo: string;
}> {
  const archiveRoot = join(input.backupRoot, AUDIT_ARCHIVE_DIRNAME);
  await mkdir(archiveRoot, { recursive: true });

  const statePath = join(archiveRoot, AUDIT_ARCHIVE_STATE_FILE);
  const state = await readArchiveState(statePath);
  const archivedFrom = state.archivedUntil ?? "1970-01-01T00:00:00.000Z";
  const archivedTo = new Date(Date.now() - input.retentionLagMs).toISOString();

  if (new Date(archivedFrom) >= new Date(archivedTo)) {
    return {
      archivedRows: 0,
      archiveFile: null,
      archivedFrom,
      archivedTo,
    };
  }

  const pool = new Pool({ connectionString: input.databaseUrl });
  try {
    const result = await pool.query<{
      id: number;
      user_id: number | null;
      action: string;
      entity_type: string;
      entity_id: number | null;
      details: unknown;
      ip_address: string | null;
      created_at: Date;
    }>(
      `
        SELECT
          id,
          user_id,
          action,
          entity_type,
          entity_id,
          details,
          ip_address,
          created_at
        FROM app.audit_logs
        WHERE created_at > $1::timestamptz
          AND created_at <= $2::timestamptz
        ORDER BY created_at ASC, id ASC
      `,
      [archivedFrom, archivedTo],
    );

    let archiveFile: string | null = null;
    if (result.rows.length > 0) {
      const archiveFilename = `audit-${toFilenameSafe(archivedFrom)}-to-${toFilenameSafe(archivedTo)}.jsonl`;
      const localArchivePath = join(input.backupDir, archiveFilename);
      const retentionArchivePath = join(archiveRoot, archiveFilename);
      const lines = result.rows.map((row) =>
        JSON.stringify({
          id: row.id,
          userId: row.user_id,
          action: row.action,
          entityType: row.entity_type,
          entityId: row.entity_id,
          details: row.details,
          ipAddress: row.ip_address,
          createdAt: row.created_at,
        }),
      );

      await writeFile(localArchivePath, `${lines.join("\n")}\n`, "utf8");
      await cp(localArchivePath, retentionArchivePath, { force: true });
      archiveFile = retentionArchivePath;
    }

    await writeArchiveState(statePath, {
      archivedUntil: archivedTo,
      updatedAt: new Date().toISOString(),
    });

    return {
      archivedRows: result.rows.length,
      archiveFile,
      archivedFrom,
      archivedTo,
    };
  } finally {
    await pool.end();
  }
}

async function cleanupOldAuditArchives(
  archiveRoot: string,
  retentionMs: number,
): Promise<void> {
  const now = Date.now();
  const entries = await readdir(archiveRoot, { withFileTypes: true }).catch(
    async (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    },
  );

  for (const entry of entries) {
    if (entry.name === AUDIT_ARCHIVE_STATE_FILE) {
      continue;
    }

    const fullPath = join(archiveRoot, entry.name);
    const info = await stat(fullPath);
    if (now - info.mtimeMs <= retentionMs) {
      continue;
    }

    if (entry.isDirectory()) {
      await rm(fullPath, { recursive: true, force: true });
      continue;
    }

    await rm(fullPath, { force: true });
  }
}

async function readArchiveState(path: string): Promise<{
  archivedUntil: string | null;
}> {
  const raw = await readFile(path, "utf8").catch(
    async (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return "";
      }
      throw error;
    },
  );

  if (!raw) {
    return { archivedUntil: null };
  }

  try {
    const parsed = JSON.parse(raw) as { archivedUntil?: unknown };
    if (typeof parsed.archivedUntil === "string") {
      return { archivedUntil: parsed.archivedUntil };
    }
  } catch {
    return { archivedUntil: null };
  }

  return { archivedUntil: null };
}

async function writeArchiveState(
  path: string,
  state: { archivedUntil: string; updatedAt: string },
): Promise<void> {
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

const toFilenameSafe = (value: string): string => value.replace(/[:.]/g, "-");
