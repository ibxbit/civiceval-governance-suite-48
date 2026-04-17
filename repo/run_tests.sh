#!/usr/bin/env sh
set -e

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

echo "=== Starting database ==="
docker compose up -d database
echo "Waiting for database to be healthy..."
until docker compose exec -T database pg_isready -U app_user -d eaglepoint >/dev/null 2>&1; do
  sleep 2
done
echo "Database is ready."

export DATABASE_URL="postgresql://app_user:dev_postgres_password@localhost:5432/eaglepoint"
export NODE_ENV=test
export JWT_SECRET="test-jwt-secret-civiceval-docker-test-suite-2026"
export CORS_ORIGIN="*"

UNIT_REPORT=".vitest-unit.json"
API_REPORT=".vitest-api.json"
INTEGRATION_REPORT=".vitest-integration.json"
NOMOCK_REPORT=".vitest-nomock.json"

UNIT_EXIT=0
API_EXIT=0
INTEGRATION_EXIT=0
NOMOCK_EXIT=0
FE_EXIT=0

echo ""
echo "=== Installing dependencies ==="
npm install --workspace backend --include=dev
npm install --workspace frontend --include=dev

echo ""
echo "=== Running backend unit tests ==="
npm exec --workspace backend -- vitest run unit_tests --reporter=json --outputFile "$SCRIPT_DIR/$UNIT_REPORT" || UNIT_EXIT=$?

echo ""
echo "=== Running backend API tests ==="
npm exec --workspace backend -- vitest run API_tests --reporter=json --outputFile "$SCRIPT_DIR/$API_REPORT" || API_EXIT=$?

echo ""
echo "=== Running backend integration tests ==="
npm exec --workspace backend -- vitest run integration_tests --reporter=json --outputFile "$SCRIPT_DIR/$INTEGRATION_REPORT" || INTEGRATION_EXIT=$?

echo ""
echo "=== Running backend no-mock tests (real DB) ==="
npm exec --workspace backend -- vitest run no_mock_tests --reporter=json --outputFile "$SCRIPT_DIR/$NOMOCK_REPORT" || NOMOCK_EXIT=$?

echo ""
echo "=== Running frontend tests ==="
npm exec --workspace frontend -- ng test --watch=false || FE_EXIT=$?

SUMMARY=$(node -e '
const fs = require("node:fs");
const files = process.argv.slice(1);
let total = 0, passed = 0, failed = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  try {
    const report = JSON.parse(fs.readFileSync(file, "utf8"));
    total += Number(report.numTotalTests ?? 0);
    passed += Number(report.numPassedTests ?? 0);
    failed += Number(report.numFailedTests ?? 0);
  } catch { failed += 1; }
}
process.stdout.write(`${total},${passed},${failed}`);
' "$UNIT_REPORT" "$API_REPORT" "$INTEGRATION_REPORT" "$NOMOCK_REPORT")

TOTAL_TESTS=$(printf "%s" "$SUMMARY" | cut -d',' -f1)
PASSED_TESTS=$(printf "%s" "$SUMMARY" | cut -d',' -f2)
FAILED_TESTS=$(printf "%s" "$SUMMARY" | cut -d',' -f3)

echo ""
echo "================================"
echo "Test Summary (Backend)"
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"
echo "================================"
echo ""
echo "Frontend: exit code $FE_EXIT"

rm -f "$UNIT_REPORT" "$API_REPORT" "$INTEGRATION_REPORT" "$NOMOCK_REPORT"

if [ "$UNIT_EXIT" -ne 0 ] || [ "$API_EXIT" -ne 0 ] || [ "$INTEGRATION_EXIT" -ne 0 ] || [ "$NOMOCK_EXIT" -ne 0 ] || [ "$FE_EXIT" -ne 0 ] || [ "$FAILED_TESTS" -ne 0 ]; then
  exit 1
fi

exit 0
