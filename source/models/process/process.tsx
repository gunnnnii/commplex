import { observable, computed, action, flow, flowResult, runInAction, when } from "mobx";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createMessage, type Message } from "./message.js";
import type { Script } from "./script.js";
import { match } from "ts-pattern";
import type { CancellablePromise } from "mobx/dist/internal.js";
import { Doc } from "./doc.js";

export type ProcessState =
	| { status: "dead"; state: "closing" | "closed" }
	| {
		status: "alive";
		state: "starting" | "running";
		runningSince: null | number;
	};

type SpawnResolution = { success: true } | { success: false, code?: number | null }

export class Process {
	@observable accessor #state = "closed" as ProcessState["state"];
	@observable accessor #runningSince: number | null = null;
	@observable accessor #exitCode: Promise<number | null> | null = null;
	@observable accessor #childProcess: ChildProcessWithoutNullStreams | null = null;

	@observable accessor messages: Message[] = [];

	@computed get state(): ProcessState {
		const state = this.#state;

		return match(state)
			.with("starting", (state) => ({
				status: "alive" as const,
				state,
				runningSince: this.#runningSince,
			}))
			.with("running", (state) => ({
				status: "alive" as const,
				state,
				runningSince: this.#runningSince,
			}))
			.with("closing", (state) => ({
				status: "dead" as const,
				state,
			}))
			.with("closed", (state) => ({
				status: "dead" as const,
				state,
			}))
			.exhaustive();
	}

	readonly name: Script["name"];
	readonly script: Script["script"];
	readonly autostart: Script["autostart"];
	readonly type: Script["type"];
	readonly docs?: Doc;

	constructor(script: Script) {
		this.name = script.name;
		this.script = script.script;
		this.autostart = script.autostart;
		this.type = script.type;

		if (script.docs) {
			this.docs = new Doc(this, script.docs);
		}
	}

	// private property fails to bind to the class instance
	@flow.bound
	private *startConnection() {
		if (this.#state === 'closing') {
			this.#childProcess?.kill('SIGKILL');
		}

		if (this.#state === 'running') {
			this.disconnect();
			yield when(() => this.#state === 'closed');
		}

		this.#exitCode = null;
		this.#state = "starting";

		const child = spawn(this.script, {
			shell: true,
			stdio: "pipe",
			env: {
				...globalThis.process.env,
				FORCE_COLOR: "1",
			},
		});

		this.#childProcess = child;

		const startResolver = Promise.withResolvers<SpawnResolution>();

		child.once('spawn', () => {
			startResolver.resolve({ success: true });
		})

		child.once('error', (err) => {
			this.#addMessage(err.message, "stderr");
			startResolver.resolve({ success: false });
		});

		child.once('close', (code) => {
			startResolver.resolve({ success: false, code });
		});

		let success = false;

		try {
			success = yield startResolver.promise;
		} finally {
			child.removeAllListeners();
		}

		if (success) {
			this.#connect(child);
		} else {
			this.#state = 'closed';
		}
	}

	@action #connect(child: ChildProcessWithoutNullStreams) {
		this.#state = 'running';
		const exitPromise = Promise.withResolvers<number | null>()

		child.stdout.on('data', (data) => {
			this.#addMessage(data.toString(), "stdout");
		});

		child.stderr.on('data', (data) => {
			this.#addMessage(data.toString(), "stderr");
		});

		child.on('exit', code => {
			this.#state = 'closing';
			exitPromise.resolve(code);
		})

		child.once('close', (code) => {
			runInAction(() => {
				this.#state = 'closed';
				exitPromise.resolve(code);
				child.removeAllListeners();
			})
		})
	}

	#startedConnectPromise: CancellablePromise<void> | null = null;
	connect() {
		if (this.#startedConnectPromise == null) {
			const promise = flowResult(this.startConnection())
			this.#startedConnectPromise = promise;

			promise.finally(() => {
				this.#startedConnectPromise = null;
			})
		}

		return this.#startedConnectPromise
	}

	async disconnect(signal?: NodeJS.Signals | number) {
		const exitCode = this.#exitCode;

		if (this.#state === 'closing') return await exitCode;

		runInAction(() => {
			this.#state = 'closing';
		})

		this.#childProcess?.kill(signal);

		return await exitCode;
	}

	@action #addMessage(data: string, channel: "stdout" | "stderr") {
		this.messages.push(createMessage(data, channel));
	}
}
