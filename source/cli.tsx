#!/usr/bin/env node
import { batchedUpdates, render, Text } from 'ink'
import { MemoryRouter, Route, Routes } from 'react-router'
import { Root } from './screens/root.route.js'
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary'
import { Process } from './screens/process/process.route.js'
import { observerBatching } from 'mobx-react-lite'

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
				<Route
					path=":process"
					element={
						<ErrorBoundary FallbackComponent={PrintedError}>
							<Process />
						</ErrorBoundary>
					} />
			</Route>
		</Routes>
	</MemoryRouter>,
)

function PrintedError(props: FallbackProps) {
	const error = props.error;
	if (error instanceof Error) {
		return (
			<Text color="red">
				{error.message}
			</Text>
		)
	}

	return (
		<Text color="red">
			Something went wrong
		</Text>
	)
}

