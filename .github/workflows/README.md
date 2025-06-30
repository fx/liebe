# GitHub Actions Workflows

This directory contains GitHub Actions workflows for CI/CD automation.

## Workflows

### CI (`ci.yml`)
- **Triggers**: On push to `main` and on pull requests
- **Jobs**:
  - **Test**: Runs all unit tests
  - **Lint**: Runs ESLint and TypeScript type checking
  - **Build**: Builds both the development and Home Assistant production builds
- **Artifacts**: Test results and build outputs are uploaded for 7 days

### PR Checks (`pr-checks.yml`)
- **Triggers**: On pull request events
- **Jobs**:
  - **Size Check**: Comments on PR size to encourage smaller, focused PRs
  - **Test Coverage**: Runs tests with coverage and posts results as a comment

### Dependency Review (`dependency-review.yml`)
- **Triggers**: On pull requests
- **Purpose**: Checks for security vulnerabilities and license compatibility
- **Blocks**: High severity vulnerabilities and GPL/AGPL licensed dependencies

## Local Development

To run the same checks locally before pushing:

```bash
# Run all tests
npm test

# Run linting
npm run lint

# Check types
npm run typecheck

# Build the project
npm run build
npm run build:ha
```

## Required Secrets

No secrets are currently required for these workflows. They use only the default `GITHUB_TOKEN`.

## Branch Protection

For these workflows to be effective, configure branch protection rules for `main`:
1. Require status checks to pass before merging
2. Select these required checks:
   - Test
   - Lint
   - Build
3. Require branches to be up to date before merging
4. Require pull request reviews before merging