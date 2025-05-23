import { z } from 'zod/v4'

export const Script = z.object({
  name: z.string(),
  script: z.string(),
  autostart: z.boolean().optional().default(false),
  type: z.enum(['service', 'task', 'script']).optional().default('script'),
  docs: z.string().optional()
})

export type Script = z.infer<typeof Script>