# commplex

Commplex is a simple terminal multiplexer for Javascript projects.

## usage

All you need to get started is to run it in your project root. 

```bash
npx commplex
```

It will automatically pick up your package scripts and let you interactively run them.

## configuration

For a nicer experience, you can also provide a configuration. This lets you control how your scripts are displayed and run.

```ts
type Script = {
  /**
   * this is the actual task commplex should run, fx. `npm run dev`
   */
  script: string;

  /**
   * this tells commplex how to treat the script.
   * - services are long running processes that do should not terminate on their own
   * - tasks are fire-and-forget processes that terminate on their own
   */
  type?: 'service' | 'task';
  
  /**
   * setting autostart will make commplex automatically start the process on startup
   */
  autostart?: boolean;

  /**
   * either a string with information about the script, or a path to a markdown file with information about the script
   */
  docs?: string;
}

type CommplexConfig = {
  /**
   * tells commplex to include scripts from package.json
   * 
   * defaults to true
   */
  includePackageScripts?: boolean
  scripts: {
    [name: string]: Script
  }
}
```

Commplex will read the configuration out of the projects `package.json`.

```json
{
	"commplex": {
    "includePackageScripts": false,
    "scripts": {
      "watch": {
        "script": "pnpm dev",
        "autostart": true,
        "type": "service"
      },
      "build": {
        "script": "pnpm build",
        "type": "task"
      }
    }
	},

	"name": "@gunnnnii/commplex-cli",
	"version": "0.0.10",
	"license": "MIT",
	"type": "module",
	"engines": {
		"node": ">=22"
	},
	"scripts": {
		"build": "tsc -b && vite build",
		"dev": "vite build --watch --mode development",
		"start": "node dist/cli.js",
		"test": "prettier --check . && xo && ava"
	},
	"files": [
		"dist"
	],
	"dependencies": {
		"ink": "github:gunnnnii/ink",
		"mobx": "^6.13.7",
		"mobx-react-lite": "^4.1.0",
		"package-up": "^5.0.0",
		"react": "^18.3.1",
		"react-dom": "^18.3.1",
		"react-error-boundary": "^6.0.0",
		"react-router": "^7.6.0",
		"remeda": "^2.21.3",
		"strip-ansi": "^7.1.0",
		"ts-pattern": "^5.7.0",
		"wrap-ansi": "^9.0.0",
		"zod": "^3.25.7"
	},
	"devDependencies": {
		"@babel/plugin-proposal-decorators": "^7.27.1",
		"@biomejs/biome": "1.9.4",
		"@total-typescript/tsconfig": "^1.0.4",
		"@types/node": "22",
		"@types/react": "18.3.21",
		"@vitejs/plugin-react": "^4.4.1",
		"chalk": "^5.4.1",
		"ink-testing-library": "^3.0.0",
		"prettier": "^2.8.7",
		"type-fest": "^4.41.0",
		"typescript": "^5.0.3",
		"vite": "^6.3.5"
	},
	"packageManager": "pnpm@9.12.0+sha256.a61b67ff6cc97af864564f4442556c22a04f2e5a7714fbee76a1011361d9b726"
}
```

## development

running this project locally is easy

```bash
git clone git@github.com:gunnnnii/commplex.git

cd commplex
pnpm i && pnpm dev
```

this will start vite in watch mode. you can then start the locally running project just like you would the deployed version

```bash
npx /path/to/commplex/dist
```