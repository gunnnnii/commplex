import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs/promises";
import { builtinModules } from "node:module";
import pkgjson from './package.json' with { type: "json" };
import type { PackageJson } from 'type-fest';
import { analyzer } from 'vite-bundle-analyzer'
import z from 'zod/v4';

const entryFile = "cli";
const sourceEntry = path.resolve(__dirname, "source", `${entryFile}.tsx`);
const distEntry = path.resolve(__dirname, "dist", `${entryFile}.js`);

const env = z.object({
	ANALYZE: z.stringbool(),
})
.partial()
.parse(process.env)

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const isProduction = mode === "production";
	const analyzerEnabled = env.ANALYZE

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
				compress: isProduction
			},
			rollupOptions: {
				treeshake: true,
				external: [
					...builtinModules,
					...builtinModules.map((mod) => `node:${mod}`),
				],
			},
			minify: isProduction,
			emptyOutDir: true,
		},
		resolve: {
				conditions: ["import", "module", "node", "development|production"],
				alias: {
					// Force react-router to use ESM build for better tree-shaking
					'react-router': isProduction 
						? path.resolve(__dirname, 'node_modules/react-router/dist/production/index.mjs')
						: path.resolve(__dirname, 'node_modules/react-router/dist/development/index.mjs'),
					// mobx assumes batchedUpdates is in react-dom, so we need to patch it to use ink's batchedUpdates
					'react-dom': path.resolve(__dirname, 'node_modules/ink/build/index.js')
				}
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
			analyzerEnabled ? analyzer() : null,
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
			"process.env.DEV": JSON.stringify(!isProduction),
			"process.env['DEV']": JSON.stringify(!isProduction),
			'process.env["DEV"]': JSON.stringify(!isProduction),
		},
	};
});
