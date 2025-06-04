import type { Process } from "../../models/process/process";
import { log } from "./logger";
import { WATCH_LOGS_PROCESS } from "../../constants/processes";

export function logProcess(process: Process, ...messages: string[]) {
  if (process.name === WATCH_LOGS_PROCESS) return;

  log(`[${process.name}] ${messages.join(' ')}`);
}