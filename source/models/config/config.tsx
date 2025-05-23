import z from "zod"
// import { Script } from "../process/script"

export const CommplexConfig =
  z.object({
    includePackageScripts: z.boolean().optional().default(true),
    scripts: z.record(
      z.string(),
      // don't know why this doesn't work?
      //Script.omit({ name: true }),)
      z.object({
        name: z.string(),
        script: z.string(),
        autostart: z.boolean().optional().default(false),
        type: z.enum(['service', 'task', 'script']).optional().default('script'),
        docs: z.string().optional()
      }).omit({ name: true })
    ).optional().default({})
  })

export type CommplexConfig = z.infer<typeof CommplexConfig>
