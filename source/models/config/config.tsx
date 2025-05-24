import z from "zod/v4"
import { Script } from "../process/script"

export const CommplexConfig =
  z.object({
    includePackageScripts: z.boolean().optional().default(true),
    scripts: z.record(
      z.string(),
      Script.omit({ name: true })).optional().default({}),
  })

export type CommplexConfig = z.infer<typeof CommplexConfig>
