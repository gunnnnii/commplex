import { Box, Spacer, Text, useInput } from "ink";
import { useContext, useEffect, useState, type ComponentProps, type PropsWithChildren } from "react";
import { Outlet, useLocation, useMatch, useNavigate, useParams } from "react-router";
import type { Script } from "../models/process/script.js";
import { useRows } from "../utilities/hooks/dimensions.js";
import { ErrorBoundary } from "react-error-boundary";
import { match } from "ts-pattern";
import { observer } from 'mobx-react-lite'
import type { Process, ProcessState } from "../models/process/process.js";
import { ProcessStore, ProcessStoreContext, ProcessStoreProvider, } from "../models/process/store.js";
import { flow, flowResult, isFlowCancellationError, observable } from "mobx";
import { readFile } from "node:fs/promises";
import { packageUp } from "package-up";
import { groupBy, mapValues, values } from "remeda";
import { log, logPath } from "../utilities/logging/logger.js";
import { CommplexConfig } from "../models/config/config.js";

function collectCommands(input: CommplexConfig): Script[] {
  const processes = mapValues(input.scripts, (value, key) => ({ name: key, ...value }))

  return values(processes)
}

class ConfigLoader {
  @observable accessor state: 'error' | 'loading' | 'success' | 'uninitialized' | string = 'uninitialized'

  @observable accessor config: Script[] | undefined = undefined

  @observable accessor error: unknown | undefined = undefined

  @flow.bound
  *loadConfig() {
    this.state = 'loading'

    try {
      const pkgPath: string | undefined = yield packageUp()

      if (pkgPath == null) {
        console.error('No package.json found')
        process.exit(1)
      } else {
        const pkg: Record<string, unknown> = yield readFile(pkgPath, 'utf-8').then(JSON.parse);
        const hasNoConfig = pkg.commplex == null || typeof pkg.commplex !== 'object';

        const config = CommplexConfig.parse(pkg.commplex ?? {})
        const scripts = collectCommands(config);

        if (hasNoConfig || config.includePackageScripts) {
          if ('scripts' in pkg && pkg.scripts != null && typeof pkg.scripts === 'object') {
            const pkgScripts = Object.entries(pkg.scripts)
              .map(([name, script]) => ({
                name,
                script,
                autostart: false,
                type: 'script' as const,
              }));

            setTimeout(() => {
              log(JSON.stringify(pkgScripts, null, 2))
            }, 5000)

            scripts.push(...pkgScripts)
          }
        }

        if (import.meta.env.MODE === 'development') {
          scripts.push({
            autostart: true,
            name: 'watch_logs',
            script: `tail -f ${logPath}`,
            type: 'devservice',
          })
        }

        this.state = 'success'
        this.config = scripts;

        return scripts;
      }
    } catch (error) {
      this.state = 'error'
      this.error = error
    }
  }
}

export const SplashScreen = observer(() => {
  const rows = useRows();

  return (
    <Box paddingY={1} paddingRight={1} gap={1} flexGrow={1} minHeight={rows} height={rows} overflowY='hidden' justifyContent="center" alignItems="center">
      <Text>Loading...</Text>
    </Box>
  )
})

export const LoadedRoot = observer((props: { loader: ConfigLoader }) => {
  const scripts = props.loader.config ?? [];
  const [store] = useState(() => new ProcessStore(scripts));
  const rows = useRows();

  useEffect(() => {
    for (const script of scripts) {
      if (!store.processes.has(script.name)) {
        const process = store.addProcess(script);
        if (process.autostart) process.connect().catch((error) => {
          if (!isFlowCancellationError(error)) {
            throw error;
          }
        });
      }
    }
  }, [store, scripts]);

  useEffect(() => {
    for (const process of store.processes.values()) {
      if (process.autostart) {
        process.connect()
          .catch((error) => {
            if (!isFlowCancellationError(error)) {
              throw error;
            }
          });
      }
    }
  }, [store])

  const location = useLocation();
  return (
    <ProcessStoreProvider store={store}>
      <Box paddingY={1} paddingRight={1} gap={1} flexGrow={1} minHeight={rows} height={rows} overflowY='hidden'>
        <Sidebar>
          <ScriptList />
          <Spacer />
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
            <Box><Text>kill:</Text><Spacer /><Text>q</Text></Box>
            <Box><Text>restart:</Text><Spacer /><Text>⏎</Text></Box>
            <Box><Text>open docs:</Text><Spacer /><Text>d</Text></Box>
          </Box>
          {import.meta.env.MODE === 'development' ? (
            <>
              <Box height={1} />
              <Text>{location.pathname}</Text>
            </>
          ) : null}
        </Sidebar>
        <Box flexGrow={1}>
          <Outlet />
        </Box>
      </Box>
    </ProcessStoreProvider>
  )
})

export const Root = observer(() => {
  const [loader] = useState(() => new ConfigLoader());

  useEffect(() => {
    const interval = setInterval(() => { /* keep the process alive */ }, 1000);
    return () => clearInterval(interval);
  })

  useEffect(() => {
    const load = flowResult(loader.loadConfig())
    load.catch((error) => {
      if (!isFlowCancellationError(error)) {
        throw error;
      }
    });

    return () => load.cancel();
  }, [loader]);

  if (loader.state !== 'success') return <SplashScreen />

  return <LoadedRoot loader={loader} />
});

const getScore = (process: Process) => {
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

const sortProcesses = (a: Process, b: Process) => {
  const scoreA = getScore(a);
  const scoreB = getScore(b);

  if (scoreA !== scoreB) {
    return scoreA - scoreB;
  }

  return a.name.localeCompare(b.name);
}

const ScriptList = observer(() => {
  const { process: activeProcess } = useParams<"process">();
  const navigate = useNavigate();

  const store = useContext(ProcessStoreContext);
  const processes = Array.from(store.processes.values())
    .sort(sortProcesses);

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
        navigate(`process/${process.name}/docs`);
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