import { observer } from "mobx-react-lite";
import { useContext } from "react";
import { useParams } from "react-router";
import { ProcessStoreContext } from "../../../models/process/store";
import { Logs } from "./logs";

export const LogsRoute = observer(() => {
  const params = useParams<"process">();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const processName = params.process!;

  const store = useContext(ProcessStoreContext);
  const process = store.processes.get(processName);

  if (!process) throw new Error(`Process "${processName}" not found`);

  return (
    <Logs key={process.name} process={process} />
  )
})