import { batchedUpdates, render, Text } from 'ink'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { Root } from './screens/root.route.js'
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { observerBatching } from 'mobx-react-lite'
import { ProcessLayout } from './screens/process/process.layout.js'
import { LogsRoute } from './screens/process/logs/logs.route.js'
import { DocsRoute } from './screens/process/docs/docs.route.js'

observerBatching(batchedUpdates);

const enterAltScreenCommand = '\x1b[?1049h'
const leaveAltScreenCommand = '\x1b[?1049l'

process.stdout.write(enterAltScreenCommand)
process.on('exit', () => {
	process.stdout.write(leaveAltScreenCommand)
})

render(
	<MemoryRouter>
		<Routes>
			<Route path="/" Component={Root}>
				<Route index element={<Text>Welcome to commplex</Text>} />
				<Route path="process" element={
					<ErrorBoundary FallbackComponent={PrintedError}>
						<ProcessLayout />
					</ErrorBoundary>
				}>
					<Route path=":process" index element={<LogsRoute />} />
					<Route path=":process/docs" element={<DocsRoute />} />
				</Route>
			</Route>
		</Routes>
	</MemoryRouter>,
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

