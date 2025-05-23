import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs";
import { builtinModules } from "node:module";
import pkgjson from './package.json' with { type: "json" };
import type { PackageJson } from 'type-fest';

const entryFile = "cli";
const sourceEntry = path.resolve(__dirname, "source", `${entryFile}.tsx`);
const distEntry = path.resolve(__dirname, "dist", `${entryFile}.js`);

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const isProduction = mode === "production";

	return {
		build: {
			target: "node22",
			ssr: false,
			outDir: "dist",
			lib: {
				entry: sourceEntry,
				formats: ["es"],
				fileName: entryFile,
			},
			terserOptions: {
				compress: isProduction,
			},
			rollupOptions: {
				treeshake: isProduction,
				external: [
					...builtinModules,
					...builtinModules.map((mod) => `node:${mod}`),
				],
			},
			minify: isProduction,
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
				name: "add-shebang",
				closeBundle() {
					const shebang = "#!/usr/bin/env node\n";
					const filePath = path.resolve(__dirname, "dist", "cli.js");
					const fileContent = fs.readFileSync(filePath, "utf8");
					if (!fileContent.startsWith(shebang)) {
						fs.writeFileSync(filePath, shebang + fileContent);
					}
				},
			},
			{
				name: "generate-dist-package-json",
				apply: "build",
				closeBundle() {
					const outDir = path.resolve(__dirname, "dist");
					const pkg: PackageJson = {
						name: "commplex",
						version: pkgjson.version,
						engines: pkgjson.engines,
						license: pkgjson.license,
						bin: "./cli.js",
						type: "module",
					};

					const pkgPath = path.join(outDir, "package.json");
					fs.mkdirSync(outDir, { recursive: true });
					fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
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
		define: {
			"process.env.NODE_ENV": JSON.stringify(mode),
		},
	};
});

//#!/usr/bin/env node
