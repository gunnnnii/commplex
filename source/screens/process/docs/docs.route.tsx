import { observer } from "mobx-react-lite";
import { useContext } from "react";
import { useNavigate, useParams } from "react-router";
import { ProcessStoreContext } from "../../../models/process/store";
import { Text, useInput } from "ink";

export const DocsRoute = observer(() => {
  const params = useParams<"process">();

  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const processPath = params.process!;
  const processName = decodeURIComponent(processPath);

  const store = useContext(ProcessStoreContext);
  const process = store.processes.get(processName);

  const navigate = useNavigate()

  useInput((input) => {
    if (input === 'b') {
      navigate(-1);
    }
  });

  if (!process) throw new Error(`Process "${processName}" not found`);

  const content = process.docs?.content;

  if (!content) {
    return (
      <Text>{processName} has no docs</Text>
    )
  }

  return (
    <Text>{content}</Text>
  )
})