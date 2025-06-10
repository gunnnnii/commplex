export default {
  files: ['tests/**/*.test.{ts,tsx}'],
  extensions: {
    ts: 'module',
    tsx: 'module'
  },
  nodeArguments: [
    '--no-warnings'
  ],
  require: [
    './tests/helpers/babel-register.cjs'
  ],
  environmentVariables: {
    NODE_ENV: 'test'
  }
};