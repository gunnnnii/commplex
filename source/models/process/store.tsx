import { action, observable } from "mobx";
import { createContext, type PropsWithChildren, useState, useEffect } from "react";
import type { Script } from "./script";
import { Process } from "./process";

export class ProcessStore {
  @observable accessor processes: Map<string, Process>;

  constructor(initialScripts: Script[] = []) {
    const processes = initialScripts.map(
      script => [script.name, new Process(script)] as const,
    );
    this.processes = new Map(processes);
  }

  @action addProcess(script: Script) {
    const process = new Process(script);
    this.processes.set(script.name, process);
    return process;
  }

  @action removeProcess(name: string) {
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
        process.kill();
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