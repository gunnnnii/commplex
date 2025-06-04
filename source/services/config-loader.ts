import { flow, flowResult, observable } from "mobx";
import { readFile } from "node:fs/promises";
import { packageUp } from "package-up";
import { mapValues, values } from "remeda";
import { CommplexConfig } from "../models/config/config.js";
import type { Script } from "../models/process/script.js";
import { log, logPath } from "../utilities/logging/logger.js";
import { WATCH_LOGS_PROCESS } from "../constants/processes.js";

function collectCommands(input: CommplexConfig): Script[] {
	const processes = mapValues(input.scripts, (value, key) => ({
		name: key,
		...value,
	}));
	return values(processes);
}

function createDevScript(): Script {
	return {
		autostart: true,
		name: WATCH_LOGS_PROCESS,
		command: `tail -f ${logPath}`,
		type: "devservice",
	};
}

function createPackageScripts(
	packageScripts: Record<string, unknown>
): Script[] {
	return Object.entries(packageScripts)
		.filter(([, command]) => typeof command === "string")
		.map(([name, command]) => ({
			name,
			command: command as string,
			autostart: false,
			type: "script" as const,
		}));
}

export type ConfigLoadState = "uninitialized" | "loading" | "success" | "error";

export class ConfigLoader {
	@observable accessor state: ConfigLoadState = "uninitialized";
	@observable accessor config: Script[] | undefined = undefined;
	@observable accessor error: unknown | undefined = undefined;

	@flow.bound
	*loadConfig() {
		this.state = "loading";

		try {
			const scripts = yield* this.loadScripts();

			this.state = "success";
			this.config = scripts;
			return scripts;
		} catch (error) {
			this.state = "error";
			this.error = error;
			throw error;
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: Generator types for mobx flow are complex
	private *loadScripts(): Generator<any, Script[], any> {
		const pkgPath: string | undefined = yield packageUp();

		if (pkgPath == null) {
			throw new Error("No package.json found");
		}

		const pkg: Record<string, unknown> = yield readFile(pkgPath, "utf-8").then(
			JSON.parse
		);
		const hasNoConfig =
			pkg.commplex == null || typeof pkg.commplex !== "object";

		const config = CommplexConfig.parse(pkg.commplex ?? {});
		const scripts = collectCommands(config);

		// Add package.json scripts if enabled
		if (hasNoConfig || config.includePackageScripts) {
			if (
				"scripts" in pkg &&
				pkg.scripts != null &&
				typeof pkg.scripts === "object"
			) {
				const pkgScripts = createPackageScripts(
					pkg.scripts as Record<string, unknown>
				);

				// Log package scripts in development
				if (import.meta.env.MODE === "development") {
					setTimeout(() => {
						log(JSON.stringify(pkgScripts, null, 2));
					}, 5000);
				}

				scripts.push(...pkgScripts);
			}
		}

		// Add development script in dev mode
		if (import.meta.env.MODE === "development") {
			scripts.push(createDevScript());
		}

		return scripts;
	}

	reset() {
		this.state = "uninitialized";
		this.config = undefined;
		this.error = undefined;
	}
}

// Create a singleton instance for the app
export const configLoader = new ConfigLoader();

// Helper function to load config
export async function loadConfig(): Promise<Script[]> {
	return flowResult(configLoader.loadConfig());
}
