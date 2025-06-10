// Setup for testing in Node.js terminal environment
process.env.NODE_ENV = 'test';

// Ensure we have a proper terminal environment for testing Ink
if (!process.stdout.isTTY) {
  process.stdout.isTTY = true;
  process.stdout.columns = 80;
  process.stdout.rows = 24;
}

if (!process.stdin.isTTY) {
  process.stdin.isTTY = true;
  // @ts-ignore - Mock setRawMode for testing
  process.stdin.setRawMode = () => process.stdin;
}