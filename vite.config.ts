import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";
import { builtinModules } from "node:module";

const entryFile = "cli";
const sourceEntry = path.resolve(__dirname, "source", `${entryFile}.tsx`);
const distEntry = path.resolve(__dirname, "dist", `${entryFile}.js`);

// https://vite.dev/config/
export default defineConfig({
	build: {
		target: "node22",
		ssr: false,
		outDir: "dist",
		lib: {
			entry: sourceEntry,
			formats: ["es"],
			fileName: entryFile,
		},
		rollupOptions: {
			external: [
				"chalk",
				"react-dom",
				...builtinModules,
				...builtinModules.map((mod) => `node:${mod}`),
			],
		},
		minify: false,
		emptyOutDir: true,
	},
	resolve: {
		conditions: ["node", "module", "browser", "development|production"],
	},
	esbuild: {
		supported: {
			decorators: true,
		},
	},
	plugins: [
		react({
			babel: {
				plugins: [
					["@babel/plugin-proposal-decorators", { version: "2023-11" }],
				],
			},
		}),
		{
			// something, somewhere - related to mobx-react-lite - causes `unstable_batchedUpdates` to be imported from `react-dom`
			// ink has its own reconciler, so we fix the import to use that instead (after patching ink to expose its batchedUpdates implementation)
			name: "fix-batched-updates",
			generateBundle(_, bundle) {
				for (const file of Object.values(bundle)) {
					if (file.type === "chunk") {
						if (file.code.includes("unstable_batchedUpdates")) {
							const code = file.code;
							const updated = code.replace(
								/import\s*\{\s*unstable_batchedUpdates\s*\}\s*from\s*["']react-dom["']/,
								`import { batchedUpdates as unstable_batchedUpdates } from 'ink'`
							);
							file.code = updated;
						}
					}
				}
			},
		},
		{
			name: "make-cli-executable",
			closeBundle() {
				try {
					fs.chmodSync(distEntry, 0o755);
				} catch (error) {
					console.error("Failed to make cli.js executable", error);
				}
			},
		},
	],
});
