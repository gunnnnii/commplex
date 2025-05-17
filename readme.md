# commplex

Commplex is a simple terminal multiplexer for Javascript projects.

## usage

All you need to get started is to run it in your project root. 

```bash
npx @gunnnnii/commplex
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
}

type CommplexConfig = {
  scripts: {
    [name: string]: Script
  }
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
npx /path/to/commplex
```