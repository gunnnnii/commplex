# Testing Setup for Commplex

This project uses **Vitest** for testing, which integrates seamlessly with the existing Vite build configuration.

## Test Structure

- `tests/models/interactive/focus-navigation.test.tsx` - Comprehensive tests for focus navigation behavior
- `tests/helpers/setup.ts` - Test environment setup for terminal/TTY simulation
- `tests/focus-navigation-spec.md` - Detailed specification of the focus navigation rules

## Running Tests

```bash
# Run all tests
pnpm test

# Run focus navigation tests specifically
pnpm test:focus

# Run tests in watch mode
pnpm test:watch

# Run with verbose output
pnpm test:focus -- --run --reporter=verbose
```

## Test Stack

- **Vitest** - Test runner that uses your Vite configuration
- **ink-testing-library** - Testing utilities for Ink components
- **React Testing** - Standard React testing patterns

## Why Vitest?

Since this project uses Vite for building, Vitest provides:
- Seamless integration with existing Vite config
- Same transformation pipeline as the build
- Fast execution with HMR support
- Native TypeScript/JSX support without additional setup

## Test Implementation

The focus navigation tests cover:
- Tab (forward) navigation through focus groups
- Shift+Tab (backward) navigation
- Edge cases (empty groups, single elements)
- Complex nested structures
- Horizontal and vertical lists

Tests use `ink-testing-library` to render components and simulate keyboard input, tracking focus state changes to verify correct navigation order.