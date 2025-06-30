# GitHub Actions Workflows

This directory contains GitHub Actions workflows for CI automation.

## CI Workflow (`ci.yml`)

**Triggers**: On push to `main` and on pull requests

**Jobs**:

- **Test**: Runs all unit tests
- **Lint**: Runs ESLint and TypeScript type checking

## Local Development

To run the same checks locally before pushing:

```bash
# Run all tests
npm test

# Run linting
npm run lint

# Check types
npm run typecheck
```
