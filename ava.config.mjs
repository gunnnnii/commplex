export default {
  files: ['tests/**/*.test.{ts,tsx}'],
  extensions: {
    ts: 'module',
    tsx: 'module'
  },
  nodeArguments: [
    '--import=tsx/esm',
    '--no-warnings'
  ],
  environmentVariables: {
    // Ensure we're in a terminal environment for Ink tests
    FORCE_COLOR: '0',
    NODE_ENV: 'test'
  },
  require: [
    './tests/helpers/setup.js'
  ],
  verbose: true,
  timeout: '30s'
};