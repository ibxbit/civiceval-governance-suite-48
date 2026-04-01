# Backend Test Verification

Official backend verification now runs through:

```bash
sh run_tests.sh
```

What this does:

1. Runs unit tests in `backend/unit_tests/`.
2. Runs API integration tests in `backend/API_tests/`.
3. Prints a final summary with `Total Tests`, `Passed`, and `Failed`.

Equivalent npm command:

```bash
npm run test:all
```
