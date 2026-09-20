# Development Guidelines

- Follow the runtime and dependency requirements in `package.json`.
- Use `npm install` so the release-age policy in `.npmrc` is applied.
- Keep backend code in `src/` and frontend code in `web/`.
- Use Oxfmt for formatting and Oxlint for linting.
- Do not modify existing E2E tests, fixtures, Playwright configuration, or test tooling while
  implementing a new feature or fixing application code. Only change the test suite when the user
  explicitly requests test changes or the task is specifically test-suite work.
- When a test fails during feature work, report the failure and fix the application code; do not
  weaken, skip, or rewrite the test to make it pass.
- When creating or maintaining tests, do not modify application code in `src/` or `web/` without
  explicit user permission. If tests expose an application defect, report it and request permission
  before changing application code. Do not weaken, skip, delete, or rewrite the test to avoid the
  failure.
- Test-suite work may modify `e2e/`, Playwright configuration, test fixtures, test scripts, and
  test-specific TypeScript configuration as needed.

## Verification

Run these commands for every change:

```sh
npm run format
npm run check
npm run test:e2e
```

`npm run test:e2e` runs the full Playwright suite, including the browser suite and the isolated
backend limits suite. Keep in mind that a failure in `./e2e/external` might indicate an issue with
external dependencies rather than the application code itself.

The standard E2E command uses ports `5173` and `3000` and reuses compatible servers that are
already running. Use `npm run test:e2e:isolated` to start a parallel app and backend on ports
`5174` and `3001` instead.

## README.md

./README.md should not be used for AGENT-related instructions. Keep it as short and to the point as possible.
