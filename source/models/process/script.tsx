import { z } from 'zod/v4'

export const ScriptType = z.enum(['service', 'task', 'script', 'devtask', 'devservice']);

export const Script = z.object({
  name: z.string(),
  script: z.string(),
  autostart: z.boolean().optional().default(false),
  type: ScriptType.optional().default('script'),
  docs: z.string().optional()
})

export type Script = z.infer<typeof Script>