import type { Process } from "../../models/process/process";
import { log } from "./logger";

export function logProcess(process: Process, ...messages: string[]) {
  if (process.name === "watch_logs") return;

  log(`[${process.name}] ${messages.join(' ')}`);
}