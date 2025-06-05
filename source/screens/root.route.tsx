import { Box, Spacer, Text, useInput } from "ink";
import { useContext, useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import { Outlet, useMatch, useNavigate, useParams } from "react-router";
import type { Script } from "../models/process/script.js";
import { useRows } from "../utilities/hooks/dimensions.js";
import { match } from "ts-pattern";
import { observer } from 'mobx-react-lite'
import type { Process, ProcessState } from "../models/process/process.js";
import { ProcessStore, ProcessStoreContext, ProcessStoreProvider, } from "../models/process/store.js";
import { flowResult, isFlowCancellationError } from "mobx";
import { configLoader } from "../services/config-loader.js";
import { groupBy } from "remeda";
import { NavigationLink } from "../components/navigation/navigation-link.js";

const ConfigLoadingScreen = observer(() => {
  const rows = useRows();

  return (
    <Box paddingY={1} paddingRight={1} gap={1} flexGrow={1} minHeight={rows} height={rows} overflowY='hidden' justifyContent="center" alignItems="center">
      <Text>Loading configuration...</Text>
    </Box>
  )
})

const ConfigErrorScreen = observer(() => {
  const rows = useRows();
  const error = configLoader.error;

  return (
    <Box paddingY={1} paddingRight={1} gap={1} flexGrow={1} minHeight={rows} height={rows} overflowY='hidden' justifyContent="center" alignItems="center">
      <Text color="red">Failed to load configuration: {String(error)}</Text>
    </Box>
  )
})

const ProcessInitializer = observer((props: { scripts: Script[], store: ProcessStore }) => {
  const { scripts, store } = props;

  useEffect(() => {
    // Add new scripts that aren't already in the store
    for (const script of scripts) {
      if (!store.processes.has(script.name)) {
        store.addProcess(script);
      }
    }
  }, [scripts, store]);

  useEffect(() => {
    // Auto-start processes that should be auto-started
    for (const process of store.processes.values()) {
      if (process.autostart && process.state.state === 'closed') {
        process.connect().catch((error) => {
          if (!isFlowCancellationError(error)) {
            console.error(`Failed to auto-start process ${process.name}:`, error);
          }
        });
      }
    }
  }, [store]);

  return null;
});

const ContextualActions = observer(() => {
  const { process: activeProcessName } = useParams<"process">();
  const store = useContext(ProcessStoreContext);
  const isOnDocPage = useMatch("process/:process/docs");

  const activeProcess = activeProcessName ? store.processes.get(activeProcessName) : undefined;

  if (!activeProcess) {
    return (
      <Box
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderStyle="single"
        flexDirection='column'
        gap={0}
        minWidth={30}
      >
        <Box><Text>↑↓:</Text><Spacer /><Text>navigate</Text></Box>
      </Box>
    );
  }

  const actions: Array<{ key: string; action: string }> = [];

  // Navigation is always available
  actions.push({ key: "↑↓", action: "navigate" });
  actions.push({ key: "j/k", action: "scroll" });
  actions.push({ key: "c", action: "copy" });

  // Process-specific actions based on state
  if (activeProcess.state.status === 'alive') {
    actions.push({ key: "q", action: "stop" });
  } else {
    actions.push({ key: "⏎ ", action: "start" });
  }

  // Docs action if docs are available
  if (activeProcess.docs?.content) {
    if (isOnDocPage) {
      actions.push({ key: "d", action: "close docs" });
    } else {
      actions.push({ key: "d", action: "open docs" });
    }
  }

  return (
    <Box
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderStyle="single"
      flexDirection='column'
      gap={0}
      minWidth={30}
    >
      {actions.map(({ key, action }, _index) => (
        <Box key={action}>
          <Text>{key}:</Text>
          <Spacer />
          <Text>{action}</Text>
        </Box>
      ))}
    </Box>
  );
});

const ApplicationLayout = observer((props: { scripts: Script[] }) => {
  const { scripts } = props;
  const [store] = useState(() => new ProcessStore(scripts));
  const rows = useRows();

  // Auto-navigate to first process if we're on the index route
  useEffect(() => {
    windowNode.focusNext();
  }, []);

  return (
    <ProcessStoreProvider store={store}>
      <ProcessInitializer scripts={scripts} store={store} />
      <Box paddingY={1} paddingRight={1} gap={1} flexGrow={1} minHeight={rows} height={rows} overflowY='hidden'>
        <Sidebar>
          <ScriptList />
          <Spacer />
          <ContextualActions />
        </Sidebar>
        <Box flexGrow={1}>
          <Outlet />
        </Box>
      </Box>
    </ProcessStoreProvider>
  )
})

export const Root = observer(() => {
  // Load config on mount
  useEffect(() => {
    if (configLoader.state === 'uninitialized') {
      const load = flowResult(configLoader.loadConfig());
      load.catch((error) => {
        if (!isFlowCancellationError(error)) {
          console.error('Failed to load config:', error);
        }
      });

      return () => load.cancel();
    }
  }, []);

  // Keep process alive
  useEffect(() => {
    const interval = setInterval(() => { /* keep the process alive */ }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Render based on config loader state
  if (configLoader.state === 'error') {
    return <ConfigErrorScreen />;
  }

  if (configLoader.state !== 'success' || !configLoader.config) {
    return <ConfigLoadingScreen />;
  }

  return <ApplicationLayout scripts={configLoader.config} />;
});

const ScriptList = observer(() => {
  const { process: activeProcess } = useParams<"process">();
  const navigate = useNavigate();

  const store = useContext(ProcessStoreContext);
  const processes = store.sortedProcesses;

  const {
    service: serviceList = [],
    script: scriptList = [],
    task: taskList = [],
    devservice: devserviceList = [],
    devtask: devtaskList = []
  } = groupBy(processes, (process) => process.type);

  useInput((_input, key) => {
    if (key.upArrow) {
      windowNode.focusPrevious()
    }

    if (key.downArrow) {
      windowNode.focusNext()
    }
  });

  const isOnDocPage = useMatch("process/:process/docs")

  useInput((input, key) => {
    const process = processes.find(process => process.name === activeProcess);

    if (process == null) return;

    if (key.return) {
      process.connect();
    }

    if (input === 'q') {
      process.disconnect();
    }

    if (input === 'd' && process.docs?.content) {
      if (isOnDocPage) {
        navigate(-1);
      } else {
        const name = encodeURIComponent(process.name);
        navigate(`process/${name}/docs`);
      }
    }
  })

  return (
    <Box flexDirection="column" gap={1}>
      {serviceList.length > 0 ? (
        <List
          Indicator={SmallProcessStatusIndicator}
          processes={serviceList}
          isItemSelected={(process) => process.name === activeProcess}
        />
      ) : null}
      {taskList.length > 0 ? (
        <List
          title="Tasks"
          Indicator={SmallProcessStatusIndicator}
          processes={taskList}
          isItemSelected={(process) => process.name === activeProcess}
        />
      ) : null}
      {scriptList.length > 0 ? (
        <List
          title="Package Scripts"
          Indicator={SmallScriptStatusIndicator}
          processes={scriptList}
          isItemSelected={(process) => process.name === activeProcess}
        />
      ) : null}
      {import.meta.env.MODE === 'development' && devserviceList.length > 0 ? (
        <List
          title="Development"
          Indicator={SmallProcessStatusIndicator}
          processes={devserviceList}
          isItemSelected={(process) => process.name === activeProcess}
        />
      ) : null}
      {import.meta.env.MODE === 'development' && devtaskList.length > 0 ? (
        <List
          Indicator={SmallProcessStatusIndicator}
          processes={devtaskList}
          isItemSelected={(process) => process.name === activeProcess}
        />
      ) : null}
    </Box>
  );
})

const List = observer((props: {
  title?: string; processes: Process[],
  isItemSelected: (item: Process, index: number) => boolean,
  Indicator?: (props: { status: ProcessState }) => ReactNode,
}) => {
  return (
    <Box flexDirection="column">
      {props.title ? <Text>{props.title}</Text> : null}
      {props.processes.map(process => (
        <ProcessLink
          key={process.name}
          process={process}
          Indicator={props.Indicator}
        />
      ))}
    </Box>
  )
})

const ProcessLink = (props: { process: Process, Indicator?: (props: { status: ProcessState }) => ReactNode }) => {
  const [isHovered, setIsHovered] = useState(false);
  const process = props.process;
  const indicator = props.Indicator != null ? <props.Indicator status={process.state} /> : null;

  return (
    <NavigationLink
      to={`/process/${process.name}`}
      borderStyle="arrow"
      borderTop={false}
      borderBottom={false}
      borderLeft={false}
      borderRight={isHovered}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      activeChildren={
        <Text
        >
          {indicator}{" "}
          <Text underline>{process.name}</Text>
        </Text>
      }
    >
      <Text
      >
        {indicator}{" "}
        <Text underline={isHovered}>{process.name}</Text>
      </Text>
    </NavigationLink>
  )
}

const SmallProcessStatusIndicator = observer((props: { status: ProcessState }) => {
  const errored = props.status.status === 'dead' // && props.status !== 0;

  const icon: string = match(props.status)
    .with({ state: 'starting' }, () => '◯')
    .with({ state: 'running' }, () => '⬤')
    .with({ state: 'closing' }, () => '◯')
    .with({ state: 'closed' }, () => errored ? '⬤' : '◯')
    .exhaustive();

  const color: string = match(props.status)
    .with({ state: 'running' }, () => 'green')
    .with({ state: 'closed' }, () => errored ? 'red' : 'black')
    .otherwise(() => 'yellow')

  return (<Text color={color}>{icon}</Text>)
})

const SmallScriptStatusIndicator = observer((props: { status: ProcessState }) => {
  const icon: string = match(props.status)
    .with({ state: 'running' }, () => '⬤')
    .otherwise(() => '◯')

  return (<Text>{icon}</Text>)
})

function Sidebar(props: PropsWithChildren) {
  return (
    <Box
      borderStyle="single"
      borderLeft={false}
      borderBottom={false}
      borderTop={false}
      borderColor="black"
      flexDirection='column'
      padding={1}
      flexShrink={0}
    >
      {props.children}
    </Box>
  )
}
