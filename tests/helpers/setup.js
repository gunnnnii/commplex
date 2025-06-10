// Setup for Ink testing
process.env.NODE_ENV = 'test';

// Ensure we have a proper terminal environment for testing
if (!process.stdout.isTTY) {
  process.stdout.isTTY = true;
  process.stdout.columns = 80;
  process.stdout.rows = 24;
}

if (!process.stdin.isTTY) {
  process.stdin.isTTY = true;
  process.stdin.setRawMode = () => {};
}

// Add any global test utilities here
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));