import { observer } from "mobx-react-lite";
import { useContext, useMemo } from "react";
import { useParams } from "react-router";
import { ProcessStoreContext } from "../../../models/process/store";
import type { Process } from "../../../models/process/process";
import { computed, observable } from "mobx";
import { ScrollView } from "../../../models/scrollable/scroll-view";
import type { Content } from "../../../models/scrollable/scrollable";
import { inspect } from "node:util";
import { WATCH_LOGS_PROCESS } from "../../../constants/processes";
import chalk from "chalk";

// Configuration for message collapsing
const REPEAT_TIMEOUT_MS = 5000; // 5 seconds - after this time, repeated messages will be logged again

interface LogEntry {
  content: string;
  timestamp: string;
}

interface ProcessedMessage {
  id: string;
  content: string;
  timestamp: string;
  count: number;
  originalContent: string;
}

class WatchLogsContentContainer {
  @observable accessor process: Process;

  constructor(process: Process) {
    this.process = process;
  }

  @computed
  get content(): Content[] {
    const processedMessages = this.#processMessages();
    return processedMessages.map(msg => ({
      id: msg.id,
      content: msg.content
    }));
  }

  #processMessages(): ProcessedMessage[] {
    const processedMessages: ProcessedMessage[] = [];
    let currentGroup: ProcessedMessage | null = null;

    for (const message of this.process.messages) {
      // Split the message content by newlines to handle multiple JSON objects
      const lines = message.content.trim().split('\n');

      for (const line of lines) {
        // Try to parse each line as a JSON log entry
        let logEntry: LogEntry;
        try {
          logEntry = JSON.parse(line.trim()) as any;
        } catch {
          // If it's not valid JSON, treat it as a regular message
          processedMessages.push({
            id: message.id,
            content: this.#formatMessage(line.trim(), new Date(message.timestamp).toISOString(), 1),
            timestamp: new Date(message.timestamp).toISOString(),
            count: 1,
            originalContent: line.trim()
          });
          currentGroup = null;
          continue;
        }

        const messageTimestamp = new Date(logEntry.timestamp).getTime();

        // Check if this message should be grouped with the current group
        if (currentGroup &&
          currentGroup.originalContent === logEntry.content &&
          (messageTimestamp - new Date(currentGroup.timestamp).getTime()) < REPEAT_TIMEOUT_MS) {

          // Update the existing group
          currentGroup.count++;
          currentGroup.timestamp = logEntry.timestamp;
          currentGroup.content = this.#formatMessage(logEntry.content, logEntry.timestamp, currentGroup.count);
        } else {
          // Start a new group or add standalone message
          currentGroup = {
            id: message.id,
            content: this.#formatMessage(logEntry.content, logEntry.timestamp, 1),
            timestamp: logEntry.timestamp,
            count: 1,
            originalContent: logEntry.content
          };
          processedMessages.push(currentGroup);
        }
      }
    }

    return processedMessages;
  }

  #formatMessage(content: string, timestamp: string, count: number): string {
    const time = new Date(timestamp).toLocaleTimeString();

    // Try to parse content as JSON for better formatting
    let formattedContent: string;
    try {
      const parsed = JSON.parse(content);
      // Use util.inspect with nice formatting - indentation will be preserved by scroll-view
      formattedContent = inspect(parsed, {
        colors: true,
        depth: 4,
        compact: false,
        breakLength: 80,
        maxArrayLength: 20,
        maxStringLength: 300,
        sorted: true
      });
    } catch {
      // If not JSON, use content as-is
      formattedContent = content;
    }

    const formattedTime = chalk.white(`[${time}]`);

    if (count > 1) {
      const repeat = chalk.white(`(x${count})`);

      if (formattedContent.endsWith('\n')) {
        formattedContent = formattedContent.slice(0, -1);
      }

      return `${formattedTime} ${formattedContent} ${repeat}`;
    }
    return `${formattedTime} ${formattedContent}`;
  }
}

export const WatchLogsRoute = observer(() => {
  const params = useParams<"process">();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const processName = params.process!;

  const store = useContext(ProcessStoreContext);
  const process = store.processes.get(WATCH_LOGS_PROCESS);

  if (!process) throw new Error(`Process "${processName}" not found`);

  const container = useMemo(() => {
    return new WatchLogsContentContainer(process);
  }, [process]);

  return (
    <ScrollView content={container} justifyContent="flex-end" />
  );
}); 