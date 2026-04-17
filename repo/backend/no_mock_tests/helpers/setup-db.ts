import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const DEFAULT_DATABASE_URL =
  "postgresql://app_user:dev_postgres_password@localhost:5432/eaglepoint";

const JWT_SECRET_FOR_TESTS = "test-jwt-secret-civiceval-no-mock-suite-2026";

export const setupTestEnv = (): void => {
  if (!process.env["DATABASE_URL"]) {
    process.env["DATABASE_URL"] = DEFAULT_DATABASE_URL;
  }
  process.env["NODE_ENV"] = "test";
  process.env["JWT_SECRET"] = JWT_SECRET_FOR_TESTS;
  process.env["CORS_ORIGIN"] = "*";
  process.env["HOST"] = "127.0.0.1";
  process.env["PORT"] = "3001";
};

const ALL_APP_TABLES = [
  "app.analytics_events",
  "app.activity_checkins",
  "app.activity_checkin_codes",
  "app.activity_registrations",
  "app.evaluation_submissions",
  "app.evaluation_questions",
  "app.evaluation_forms",
  "app.comment_reports",
  "app.comments",
  "app.qna_reports",
  "app.qna_entries",
  "app.rankings",
  "app.cms_content_versions",
  "app.cms_content",
  "app.cms_files",
  "app.audit_logs",
  "app.activities",
  "app.auth_login_events",
  "app.login_devices",
  "app.login_attempts",
  "app.sessions",
  "app.users",
] as const;

export const cleanupDb = async (pool: Pool): Promise<void> => {
  const tableList = ALL_APP_TABLES.join(", ");
  await pool.query(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);
};

export const canConnectToDb = async (): Promise<boolean> => {
  const connectionString =
    process.env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL;

  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 3_000,
  });

  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
};

export const nonceHeaders = (): Record<string, string> => ({
  "x-nonce": `nomock-${randomUUID().replace(/-/g, "")}`,
  "x-timestamp": String(Date.now()),
});

export const authHeaders = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
  ...nonceHeaders(),
});
