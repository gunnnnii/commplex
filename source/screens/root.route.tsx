import { Box, Spacer, Text, useInput } from "ink";
import { useContext, useEffect, useState, type ComponentProps, type PropsWithChildren } from "react";
import { Outlet, useMatch, useNavigate, useParams, useLocation } from "react-router";
import type { Script } from "../models/process/script.js";
import { useRows } from "../utilities/hooks/dimensions.js";
import { ErrorBoundary } from "react-error-boundary";
import { match } from "ts-pattern";
import { observer } from 'mobx-react-lite'
import type { Process, ProcessState } from "../models/process/process.js";
import { ProcessStore, ProcessStoreContext, ProcessStoreProvider, } from "../models/process/store.js";
import { flowResult, isFlowCancellationError } from "mobx";
import { configLoader } from "../services/config-loader.js";
import { groupBy } from "remeda";

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
      {actions.map(({ key, action }, index) => (
        <Box key={index}>
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
  const navigate = useNavigate();
  const location = useLocation();

  // Auto-navigate to first process if we're on the index route
  useEffect(() => {
    if (location.pathname === '/' && store.firstProcess) {
      const processName = encodeURIComponent(store.firstProcess.name);
      navigate(`/process/${processName}`, { replace: true });
    }
  }, [location.pathname, store.firstProcess, navigate]);

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
    const previous = processes.findIndex(process => process.name === activeProcess) ?? -1;

    if (key.upArrow) {
      const nextIdx = (previous - 1 + processes.length) % processes.length;
      const next = processes.at(nextIdx);

      if (next) {
        const name = encodeURIComponent(next.name);
        navigate(`process/${name}`);
      }
    }

    if (key.downArrow) {
      const nextIdx = ((previous + 1) % processes.length);
      const next = processes.at(nextIdx);

      if (next) {
        const name = encodeURIComponent(next.name);
        navigate(`process/${name}`);
      }
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
  Indicator?: (props: { status: ProcessState }) => JSX.Element,
}) => {
  return (
    <Box flexDirection="column">
      {props.title ? <Text>{props.title}</Text> : null}
      {props.processes.map((process, index) =>
      (
        <>
          <Text
            key={process.name}
          >
            {props.Indicator != null ? <props.Indicator status={process.state} /> : null}
            <Text>{" "}</Text>
            <Text underline={props.isItemSelected(process, index)}>
              <ScriptListItem name={process.name} />
            </Text>
          </Text>
        </>
      )
      )}
    </Box>
  )
})

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

const InternalCommandListItem = observer((props: ComponentProps<typeof ScriptListItem>) => {
  const activeProcess = useParams<"process">();
  const store = useContext(ProcessStoreContext);
  const process = store.processes.get(props.name);

  const isActive = activeProcess.process === props.name;

  return (
    <Text underline={isActive}>{process?.name ?? props.name}</Text>
  )
})

const ScriptListItem = observer((props: { name: string; }) => {
  return (
    <ErrorBoundary fallback={null}>
      <InternalCommandListItem {...props} />
    </ErrorBoundary>
  )
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