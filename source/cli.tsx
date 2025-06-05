import { batchedUpdates, render, Text } from 'ink'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { Root } from './screens/root.route.js'
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { observerBatching } from 'mobx-react-lite'
import { ProcessLayout } from './screens/process/process.layout.js'
import { LogsRoute } from './screens/process/logs/logs.route.js'
import { WatchLogsRoute } from './screens/process/logs/watch-logs.route.js'
import { DocsRoute } from './screens/process/docs/docs.route.js'
import { log, logPath } from './utilities/logging/logger.js'
import { WATCH_LOGS_PROCESS } from './constants/processes.js'
import { FocusRoot } from './models/interactive/interactive.js'

observerBatching(batchedUpdates);

const enterAltScreenCommand = '\x1b[?1049h'
const leaveAltScreenCommand = '\x1b[?1049l'

process.stdout.write(enterAltScreenCommand)
process.on('exit', () => {
	process.stdout.write(leaveAltScreenCommand)
})

log("starting commplex log\n");
log(`logs stored at ${logPath}\n`);

render(
	<FocusRoot>
		<MemoryRouter>
			<Routes>
				<Route path="/" Component={Root}>
					<Route path="process" element={
						<ErrorBoundary FallbackComponent={PrintedError}>
							<ProcessLayout />
						</ErrorBoundary>
					}>
						<Route path={WATCH_LOGS_PROCESS} element={<WatchLogsRoute />} />
						<Route path=":process" index element={<LogsRoute />} />
						<Route path=":process/docs" element={<DocsRoute />} />
					</Route>
					<Route index path="/*" element={<Text>Commplex</Text>} />
				</Route>
			</Routes>
		</MemoryRouter>
	</FocusRoot>,
)
function PrintedError(props: FallbackProps) {
	const location = useLocation()

	const error = props.error;
	if (error instanceof Error) {
		return (
			<>
				<Text>{location.pathname}</Text>
				<Text color="red">
					{error.message}
				</Text>
			</>
		)
	}

	return (
		<Text color="red">
			Something went wrong
		</Text>
	)
}

