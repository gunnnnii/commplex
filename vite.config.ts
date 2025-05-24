import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs/promises";
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
				async closeBundle() {
					const shebang = "#!/usr/bin/env node\n";
					const filePath = path.resolve(__dirname, "dist", "cli.js");
					const fileContent = await fs.readFile(filePath, "utf8");
					if (!fileContent.startsWith(shebang)) {
						await fs.writeFile(filePath, shebang + fileContent);
					}
				},
			},
			{
				name: "generate-package-contents",
				apply: "build",
				async closeBundle() {
					const outDir = path.resolve(__dirname, "dist");
					const pkg: PackageJson = {
						name: "commplex",
						version: pkgjson.version,
						engines: pkgjson.engines,
						license: pkgjson.license,
						repository: pkgjson.repository,
						bin: "./cli.js",
						type: "module",
					};

					const pkgPath = path.join(outDir, "package.json");
					await fs.mkdir(outDir, { recursive: true });
					await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));

					const readmePath = path.join(outDir, "readme.md");
					await fs.copyFile(
						path.resolve(process.cwd(), "readme.md"),
						readmePath
					)
				},
			},
			{
				name: "make-cli-executable",
				async closeBundle() {
					try {
						await fs.chmod(distEntry, 0o755);
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
