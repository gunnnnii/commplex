import { observer } from "mobx-react-lite";
import { useContext, useMemo } from "react";
import { useParams } from "react-router";
import { ProcessStoreContext } from "../../../models/process/store";
import type { Process } from "../../../models/process/process";
import { observable } from "mobx";
import { ScrollView } from "../../../models/scrollable/scroll-view";

class ProcessContentContainer {
  @observable accessor process: Process;

  constructor(process: Process) {
    this.process = process;
  }

  get content() {
    return this.process.messages;
  }
}

export const LogsRoute = observer(() => {
  const params = useParams<"process">();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const processName = params.process!;

  const store = useContext(ProcessStoreContext);
  const process = store.processes.get(processName);

  if (!process) throw new Error(`Process "${processName}" not found`);

  const container = useMemo(() => {
    return new ProcessContentContainer(process);
  }, [process]);

  return (
    <ScrollView content={container} />
  )

})