# Quarterly Restore Drill Runbook

Cadence: every quarter (Q1/Q2/Q3/Q4), within first 10 business days.

## Inputs

- Latest backup metadata from `backups/<timestamp>/`
- `postgres.dump`
- CMS files snapshot directory (`backups/<timestamp>/files`)

## Restore Steps

1. Provision isolated drill environment (non-production).
2. Restore DB dump:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" backups/<timestamp>/postgres.dump
```

3. Restore CMS files:

```bash
rsync -a backups/<timestamp>/files/ /secure/eaglepoint/cms-storage/
```

4. Start application services against restored data.
5. Verify core checks:
   - User login succeeds
   - Activity registration/check-in endpoints respond
   - CMS content and files are accessible through signed links
   - Analytics summary/export works
   - Moderation queue data present

## Verification Checklist

- [ ] DB schema and row counts match expected sample baseline
- [ ] At least one file download succeeds
- [ ] Audit archive file exists in `backups/7-year-retention/`
- [ ] Application health endpoint returns success
- [ ] Drill evidence recorded (date, operator, outcome, issues)

## Evidence Artifact

Store signed drill report at:

`ops/evidence/restore-drills/<YYYY-QN>-restore-drill.md`

Include:

- backup timestamp used
- command outputs summary
- pass/fail for each checklist item
- remediation actions for failed checks
