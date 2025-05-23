import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logStream = fs.createWriteStream(path.join(__dirname, 'commplex.log'), { flags: 'a' });

export const logPath = logStream.path;
logStream.write("starting commplex log\n");
logStream.write(`logs stored at ${logPath}\n`);

export const log = (...args: string[]) => {
  const message = `${args.join(' ')}\n`;
  logStream.write(message);
};

export function getLogFilePath(filename = 'app.log') {
  return path.join(__dirname, filename);
}
