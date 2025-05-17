import { Box, Spacer, Text, useInput } from "ink";
import { useContext, useEffect, useState, type ComponentProps, type PropsWithChildren } from "react";
import { Outlet, useNavigate, useParams } from "react-router";
import { Script } from "../models/process/script.js";
import { useRows } from "../utilities/hooks/dimensions.js";
import { ErrorBoundary } from "react-error-boundary";
import { match, P } from "ts-pattern";
import { observer } from 'mobx-react-lite'
import type { Process, ProcessState } from "../models/process/process.js";
import { ProcessStore, ProcessStoreContext, ProcessStoreProvider, } from "../models/process/store.js";
import { flow, flowResult, observable } from "mobx";
import { readFile } from "node:fs/promises";
import { packageUp } from "package-up";
import { z } from "zod";
import { groupBy, mapValues, values } from "remeda";

const commplexConfig = z.record(Script.omit({ name: true }))
type commplexConfig = z.infer<typeof commplexConfig>

function collectCommands(input: commplexConfig): Script[] {
  const processes = mapValues(input, (value, key) => ({ name: key, ...value }))

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

        const config = commplexConfig.parse(pkg.commplex ?? {})

        const scripts = collectCommands(config);
        if ('scripts' in pkg && pkg.scripts != null && typeof pkg.scripts === 'object') {
          const pkgScripts = Object.entries(pkg.scripts)
            .map(([name, script]) => ({
              name,
              script,
              autostart: false,
              type: 'script' as const,
            }));

          scripts.push(...pkgScripts)
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
        if (process.autostart) process.start();
      }
    }
  }, [store, scripts]);

  useEffect(() => {
    for (const process of store.processes.values()) {
      if (process.autostart) {
        process.start();
      }
    }
  }, [store])

  return (
    <ProcessStoreProvider store={store}>
      <Box paddingY={1} paddingRight={1} gap={1} flexGrow={1} minHeight={rows} height={rows} overflowY='hidden'>
        <Sidebar>
          <ScriptList scripts={scripts} />
          <Spacer />
          <Box borderTop borderBottom={false} borderLeft={false} borderRight={false} borderStyle="single" flexDirection='column' gap={0}>
            <Text>kill: q</Text>
            <Text>restart: [return]</Text>
          </Box>
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
    return () => load.cancel();
  }, [loader]);

  if (loader.state !== 'success') return <SplashScreen />

  return <LoadedRoot loader={loader} />
});

const sortProcesses = (a: Process, b: Process) => {
  const stateA = a.state;
  const stateB = b.state;

  if (a.type === "script" && b.type === "script") {
    return a.name.localeCompare(b.name)
  }

  if (a.type !== b.type) {
    return a.type === 'script' ? 1 : -1;
  }

  return match([stateA, stateB])
    .with([{ status: 'dead' }, P.not({ status: 'dead' })], () => 1)
    .with([P.not({ status: 'dead' }), { status: 'dead' }], () => -1)
    .otherwise(() => a.name.localeCompare(b.name))
}

const ScriptList = observer((props: { scripts: Script[] }) => {
  const { scripts } = props;

  const navigate = useNavigate();
  const [selectedScriptIndex, setSelectedCommandIndex] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedCommandIndex(previous => {
        const next = (previous - 1 + scripts.length) % scripts.length;
        return Math.abs(next);
      })
    }

    if (key.downArrow) {
      setSelectedCommandIndex(previous => {
        const next = ((previous + 1) % scripts.length)
        return Math.abs(next);
      })
    }
  });

  const store = useContext(ProcessStoreContext);
  const processes = store.processes
    .values()
    .toArray()
    .sort(sortProcesses);

  const selectedCommand = processes.at(selectedScriptIndex);

  const { service: serviceList = [], script: scriptList = [], task: taskList = [] } = groupBy(processes, (process) => process.type);

  useEffect(() => {
    if (selectedCommand) {
      navigate(`/${selectedCommand.name}`);
    }
  }, [navigate, selectedCommand]);

  return (
    <Box flexDirection="column" gap={1}>
      {serviceList.length > 0 ? (
        <List
          Indicator={SmallProcessStatusIndicator}
          processes={serviceList}
          isItemSelected={(index) => selectedScriptIndex === index}
        />
      ) : null}
      {taskList.length > 0 ? (
        <List
          Indicator={SmallProcessStatusIndicator}
          processes={taskList}
          isItemSelected={(index) => selectedScriptIndex === index}
        />
      ) : null}
      {scriptList.length > 0 ? (
        <List
          title="Scripts"
          Indicator={SmallScriptStatusIndicator}
          processes={scriptList}
          isItemSelected={(index) => selectedScriptIndex === index + serviceList.length}
        />
      ) : null}
    </Box>
  );
})

const List = observer((props: {
  title?: string; processes: Process[],
  isItemSelected: (index: number) => boolean,
  Indicator?: (props: { status: ProcessState }) => JSX.Element,
}) => {
  return (
    <Box flexDirection="column">
      {props.title ? <Text>{props.title}</Text> : null}
      {props.processes.map((script, index) =>
      (
        <>
          <Text
            key={script.name}
          >
            {props.Indicator != null ? <props.Indicator status={script.state} /> : null}
            <Text>{" "}</Text>
            <Text underline={props.isItemSelected(index)}>
              <ScriptListItem name={script.name} />
            </Text>
          </Text>
        </>
      )
      )}
    </Box>
  )
})

const SmallProcessStatusIndicator = observer((props: { status: ProcessState }) => {
  const errored = props.status.status === 'dead' && props.status.code !== 0;

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