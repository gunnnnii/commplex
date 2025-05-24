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
   * the command to run, fx. `npm run dev`
   */
  command: string;

  /**
   * how to treat the script.
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
   * include scripts from package.json#scripts
   * 
   * defaults to true
   */
  includePackageScripts?: boolean
  scripts: {
    [name: string]: Script
  }
}
```

Commplex will read the configuration out of `package.json#commplex`.

```json
{
	"commplex": {
    "includePackageScripts": false,
    "scripts": {
      "watch": {
        "command": "pnpm dev",
        "autostart": true,
        "type": "service"
      },
      "build": {
        "command": "pnpm build",
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
	"dependencies": {
	},
	"devDependencies": {
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