import { z } from 'zod'

export const Script = z.object({
  name: z.string(),
  script: z.string(),
  autostart: z.boolean().optional().default(false),
  type: z.enum(['service', 'task', 'script']).optional().default('script'),
})

export type Script = z.infer<typeof Script>