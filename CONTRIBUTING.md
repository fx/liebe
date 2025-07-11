# Contributing to Liebe

Thank you for your interest in contributing to Liebe! This guide will help you get started.

## Development Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/fx/liebe.git
   cd liebe
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

## Code Quality

We use automated tools to maintain code quality. These run automatically via git hooks:

### Pre-commit Hook

- **Prettier** formats staged files automatically
- **ESLint** fixes linting issues in TypeScript files

### Pre-push Hook

Before pushing to remote, the following checks must pass:

- **TypeScript** - `npm run typecheck`
- **ESLint** - `npm run lint`
- **Tests** - `npm test`

If any of these fail, the push will be rejected and you'll need to fix the issues first.

## Manual Commands

You can run these checks manually:

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Run tests
npm test

# Run tests with UI
npm test:ui
```

## Testing

- Write tests for new features and bug fixes
- Ensure all tests pass before submitting a PR
- Tests are located next to the components they test

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature-name`
3. Make your changes
4. Commit with semantic commit messages (see below)
5. Push to your fork (pre-push hooks will validate your code)
6. Create a Pull Request

## Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Test additions or corrections
- `chore:` - Maintenance tasks

Examples:

```
feat: add weather card variant system
fix: correct temperature display in weather card
docs: update contributing guidelines
```

## Project Structure

```
src/
├── components/     # React components
├── hooks/         # Custom React hooks
├── services/      # Home Assistant API services
├── store/         # State management
├── utils/         # Utility functions
└── routes/        # TanStack Router pages
```

## Questions?

Feel free to open an issue for questions or discussions!
