import { observer } from "mobx-react-lite";
import { useContext } from "react";
import { useParams } from "react-router";
import { ProcessStoreContext } from "../../../models/process/store";
import { Text } from "ink";

export const DocsRoute = observer(() => {
  const params = useParams<"process">();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const processName = params.process!;

  const store = useContext(ProcessStoreContext);
  const process = store.processes.get(processName);

  if (!process) throw new Error(`Process "${processName}" not found`);

  return (
    <Text>Docs for {processName}</Text>
  )
})