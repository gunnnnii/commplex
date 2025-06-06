import { useContext } from 'react';
import { Box, Text, } from 'ink';
import { Outlet, useParams } from 'react-router';
import { match } from 'ts-pattern';
import { observer } from 'mobx-react-lite';
import type { ProcessState } from '../../models/process/process.js';
import { ProcessStoreContext, } from '../../models/process/store.js';
import { WATCH_LOGS_PROCESS } from '../../constants/processes.js';

const StatusIndicator = observer((props: { status: ProcessState }) => {
  return (
    match(props.status)
      .with({ state: 'starting' }, () => (
        <Text backgroundColor='yellow' color="black">starting up</Text>
      ))
      .with({ state: 'running' }, () => (
        <Text color="background" backgroundColor='green'>running</Text>
      ))
      .with({ state: 'closing' }, () => (
        <Text backgroundColor='yellow' color="black">shutting down</Text>
      ))
      .with({ state: 'closed' }, () => (
        <Text color="white" backgroundColor='red'>dead</Text>
      ))
      .exhaustive()
  )
})

export const ProcessLayout = observer(() => {
  const params = useParams<"process">();

  // Handle both parameterized routes (:process) and literal routes (watch_logs)
  const processName = params.process
    ? decodeURIComponent(params.process)
    : WATCH_LOGS_PROCESS;

  const store = useContext(ProcessStoreContext);
  const process = store.processes.get(processName);

  if (!process) {
    throw new Error(`Process "${processName}" not found`);
  }

  const command = process.command;
  const status = process.state

  return (
    <Box flexGrow={1} flexDirection='column' gap={0}>
      <Box borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false} justifyContent='space-between'>
        <Text>{command}</Text>
        <StatusIndicator status={status} />
      </Box>
      <Box
        flexGrow={1}
        overflow='hidden'
        flexDirection='column'
        justifyContent='flex-end'
      >
        <Outlet />
      </Box>
    </Box>
  )
})

