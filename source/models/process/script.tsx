import { z } from 'zod/v4-mini'

export const ScriptType = z.enum(['service', 'task', 'script', 'devtask', 'devservice']);

export const Script = z.object({
  name: z.string(),
  command: z.string(),
  autostart: z._default(z.optional(z.boolean()), false),
  type: z._default(z.optional(ScriptType), 'script'),
  docs: z.optional(z.string())
})

export type Script = z.infer<typeof Script>