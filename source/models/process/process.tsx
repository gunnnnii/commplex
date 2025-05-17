import { observable, computed, action } from "mobx"
import { spawn } from 'node:child_process';
import { createMessage, type Message } from "./message.js";
import type { Script } from "./script.js";
import { match } from "ts-pattern";

export type ProcessState =
	| { status: 'dead'; state: 'closing' | 'closed'; code: null | number }
	| { status: 'alive'; state: 'starting' | 'running'; runningSince: null | number }

export class Process {
	#killController: AbortController | null = null

	@observable accessor #state = 'closed' as ProcessState['state']
	@observable accessor #runningSince: number | null = null
	@observable accessor #exitCode: number | null = null

	@observable accessor messages: Message[] = []

	@computed get state(): ProcessState {
		const state = this.#state;

		return match(state)
			.with('starting', (state) => ({ status: 'alive' as const, state, runningSince: this.#runningSince }))
			.with('running', (state) => ({ status: 'alive' as const, state, runningSince: this.#runningSince }))
			.with('closing', (state) => ({ status: 'dead' as const, state, code: this.#exitCode }))
			.with('closed', (state) => ({ status: 'dead' as const, state, code: this.#exitCode }))
			.exhaustive();
	}

	readonly name: Script['name'];
	readonly script: Script['script'];
	readonly autostart: Script['autostart'];
	readonly type: Script['type'];

	constructor(script: Script) {
		this.name = script.name;
		this.script = script.script;
		this.autostart = script.autostart;
		this.type = script.type;
	}

	@action start() {
		this.#killController?.abort();

		const controller = new AbortController();
		this.#killController = controller;

		this.#state = 'starting';
		this.#runningSince = Date.now();
		this.#exitCode = null;

		const child = spawn(this.script, {
			shell: true,
			stdio: 'pipe',
			signal: this.#killController.signal,
			env: {
				...globalThis.process.env,
				FORCE_COLOR: '1',
			},
		});

		child.on('spawn', () => {
			this.#connect();
		});

		child.on('exit', code => {
			this.#exit(code);
		});

		child.on('error', error => {
			if (error.name === "AbortError") {
				this.#exit(null);
			} else {
				throw error;
			}
		})

		child.on('close', code => {
			this.#close(code);
			child.removeAllListeners();
		});

		child.stdout.on('data', data => {
			this.#addMessage(data.toString(), 'stdout');
		});

		child.stderr.on('data', data => {
			this.#addMessage(data.toString(), 'stderr');
		});

		return () => {
			controller.abort();
			child.kill('SIGTERM');
		};
	}

	@action #addMessage(data: string, channel: 'stdout' | 'stderr') {
		this.messages.push(createMessage(data, channel));
	}

	@action #connect() {
		if (this.#state === 'starting') {
			this.#state = 'running';
			this.#runningSince = Date.now();
		}
	}

	@action #exit(code: number | null) {
		if (this.state.status === 'alive') {
			this.#state = 'closing';
			this.#exitCode = code ?? 0;
		}
	}

	@action #close(code: number | null) {
		if (this.state.status === 'alive') {
			this.#state = 'closed';
			this.#exitCode = code ?? 0;
		}
	}

	@action kill() {
		this.#killController?.abort();

		this.#state = 'closed';
		this.#exitCode = 0;
	}
}
