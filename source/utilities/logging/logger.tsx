import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logStream = fs.createWriteStream(path.join(__dirname, 'commplex.log'), { flags: 'a' });
const screenshotStream = fs.createWriteStream(path.join(__dirname, 'commplex_screenshot.log'), { flags: 'a' });

export const logPath = logStream.path;
export const screenshotPath = screenshotStream.path;

// Simple log entry interface
interface LogEntry {
  content: string;
  timestamp: string;
}

const logQueue: LogEntry[] = [];
let flushScheduled = false;

const FLUSH_INTERVAL_MS = 100; // How often to flush pending logs

function flushLogs() {
  if (logQueue.length === 0) {
    return;
  }

  const logsToWrite = logQueue.splice(0);

  // Use setImmediate for truly async, non-blocking writes
  setImmediate(() => {
    for (const entry of logsToWrite) {
      logStream.write(`${JSON.stringify(entry)}\n`);
    }
  });
}

function scheduleFlush() {
  if (flushScheduled) {
    return;
  }

  flushScheduled = true;
  setTimeout(() => {
    flushLogs();
    flushScheduled = false;
  }, FLUSH_INTERVAL_MS);
}

export const log = (...args: string[]) => {
  let content = args.join(' ');

  if (content.endsWith('\n')) {
    content = content.slice(0, -1);
  }

  const timestamp = new Date().toISOString();

  logQueue.push({ content, timestamp });
  scheduleFlush();
};

export const logScreenshot = (screenshot: string) => {
  screenshotStream.write(`${JSON.stringify({ content: screenshot })}\n`);
}

// Force flush any pending messages (useful for graceful shutdown)
export const forceFlush = () => {
  flushLogs();
};

export function getLogFilePath(filename = 'app.log') {
  return path.join(__dirname, filename);
}

// Graceful shutdown handling
process.on('exit', forceFlush);
process.on('SIGINT', () => {
  forceFlush();
  process.exit(0);
});
process.on('SIGTERM', () => {
  forceFlush();
  process.exit(0);
});
