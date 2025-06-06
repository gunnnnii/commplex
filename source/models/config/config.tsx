import { z } from "zod/v4-mini"
import { Script } from "../process/script"
export const CommplexConfig =
  z.object({
    includePackageScripts:
      z._default(
        z.optional(z.boolean()),
        true
      ),
    scripts:
      z._default(
        z.optional(
          z.record(
            z.string(),
            z.omit(Script, { name: true })
          )
        ),
        {}
      )
  })

export type CommplexConfig = z.infer<typeof CommplexConfig>
