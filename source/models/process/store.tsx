import { action, computed, isFlowCancellationError, observable } from "mobx";
import { createContext, type PropsWithChildren, useState, useEffect } from "react";
import type { Script } from "./script";
import { Process } from "./process";

// Process scoring and sorting logic
const getProcessScore = (process: Process): number => {
  let multiplier = 1;
  if (process.type === 'task') multiplier *= 10;
  if (process.type === 'script') multiplier *= 100;
  if (process.type === 'devtask' || process.type === 'devservice') multiplier *= 1000;

  switch (process.state.status) {
    case 'dead':
      return 2 * multiplier
    case 'alive':
      return 1 * multiplier
  }
}

const sortProcesses = (a: Process, b: Process): number => {
  const scoreA = getProcessScore(a);
  const scoreB = getProcessScore(b);

  if (scoreA !== scoreB) {
    return scoreA - scoreB;
  }

  return a.name.localeCompare(b.name);
}

export class ProcessStore {
  @observable accessor processes: Map<string, Process>;

  constructor(initialScripts: Script[] = []) {
    const processes = initialScripts.map(
      script => [script.name, new Process(script)] as const,
    );
    this.processes = new Map(processes);
  }

  @computed get sortedProcesses(): Process[] {
    return Array.from(this.processes.values()).sort(sortProcesses);
  }

  @computed get firstProcess(): Process | undefined {
    return this.sortedProcesses[0];
  }

  @action addProcess(script: Script) {
    const process = new Process(script);
    this.processes.set(script.name, process);

    if (process.autostart) process.connect()
      .catch((error) => {
        if (!isFlowCancellationError(error)) {
          throw error;
        }
      });

    return process;
  }

  @action removeProcess(name: string) {
    const process = this.processes.get(name);
    if (process) process.disconnect()
    this.processes.delete(name);
  }
}

// biome-ignore lint/style/noNonNullAssertion: <explanation>
export const ProcessStoreContext = createContext<ProcessStore>(null!);

function DefaultProcessStoreProvider(
  props: PropsWithChildren,
) {
  const [store] = useState(() => new ProcessStore())

  useEffect(() => {
    return () => {
      for (const process of store.processes.values()) {
        process.disconnect();
      }
    }
  })

  return (
    <ProcessStoreContext.Provider value={store}>
      {props.children}
    </ProcessStoreContext.Provider>
  )
}

export function ProcessStoreProvider(
  props: PropsWithChildren<{ store?: ProcessStore }>,
) {
  if (props.store) {
    return (
      <ProcessStoreContext.Provider value={props.store}>
        {props.children}
      </ProcessStoreContext.Provider>
    )
  }

  return (
    <DefaultProcessStoreProvider>{props.children}</DefaultProcessStoreProvider>
  )
}