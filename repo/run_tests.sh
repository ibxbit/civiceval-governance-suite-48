#!/usr/bin/env sh

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

UNIT_REPORT=".vitest-unit.json"
API_REPORT=".vitest-api.json"

UNIT_EXIT=0
API_EXIT=0

echo "Installing backend test dependencies..."
npm install --workspace backend --include=dev

echo "Running unit tests (backend/unit_tests)..."
npm exec --workspace backend -- vitest run unit_tests --reporter=json --outputFile "$SCRIPT_DIR/$UNIT_REPORT" || UNIT_EXIT=$?

echo "Running API tests (backend/API_tests)..."
npm exec --workspace backend -- vitest run API_tests --reporter=json --outputFile "$SCRIPT_DIR/$API_REPORT" || API_EXIT=$?

SUMMARY=$(node -e '
const fs = require("node:fs");

const files = [process.argv[1], process.argv[2]];
let total = 0;
let passed = 0;
let failed = 0;

for (const file of files) {
  if (!fs.existsSync(file)) {
    continue;
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    const report = JSON.parse(raw);
    total += Number(report.numTotalTests ?? 0);
    passed += Number(report.numPassedTests ?? 0);
    failed += Number(report.numFailedTests ?? 0);
  } catch {
    failed += 1;
  }
}

process.stdout.write(`${total},${passed},${failed}`);
' "$UNIT_REPORT" "$API_REPORT")

TOTAL_TESTS=$(printf "%s" "$SUMMARY" | cut -d',' -f1)
PASSED_TESTS=$(printf "%s" "$SUMMARY" | cut -d',' -f2)
FAILED_TESTS=$(printf "%s" "$SUMMARY" | cut -d',' -f3)

if [ "$UNIT_EXIT" -ne 0 ] && [ ! -f "$UNIT_REPORT" ]; then
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi

if [ "$API_EXIT" -ne 0 ] && [ ! -f "$API_REPORT" ]; then
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi

echo ""
echo "Test Summary"
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"

rm -f "$UNIT_REPORT" "$API_REPORT"

if [ "$UNIT_EXIT" -ne 0 ] || [ "$API_EXIT" -ne 0 ] || [ "$FAILED_TESTS" -ne 0 ]; then
  exit 1
fi

exit 0
