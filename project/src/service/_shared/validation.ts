import type { z } from "zod";

export function issueCode<Code extends string>(error: z.ZodError) {
  return error.issues[0].message as Code;
}
