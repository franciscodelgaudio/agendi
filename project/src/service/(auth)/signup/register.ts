import bcrypt from "bcryptjs";
import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const MONGO_DUPLICATE_KEY = 11000;

const registerSchema = z
  .object(
    {
      name: z.string({ error: "invalid_input" }),
      email: z.string({ error: "invalid_input" }),
      password: z.string({ error: "invalid_input" }),
    },
    { error: "invalid_input" },
  )
  .pipe(
    z.object({
      name: z.string().trim().min(1, { error: "invalid_name" }),
      email: z.string().trim().toLowerCase().pipe(z.email({ error: "invalid_email" })),
      password: z
        .string()
        .min(MIN_PASSWORD_LENGTH, { error: "password_too_short" })
        .refine((password) => Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES, {
          error: "password_too_long",
        }),
    }),
  );

export type RegisterError =
  | "invalid_input"
  | "invalid_name"
  | "invalid_email"
  | "password_too_short"
  | "password_too_long"
  | "email_taken";

export type RegisterResult = { ok: true; userId: string } | { ok: false; error: RegisterError };

type RegisterDeps = {
  findUserByEmail: (email: string) => Promise<{ id: string } | null>;
  createUser: (data: { name: string; email: string; passwordHash: string }) => Promise<{ id: string }>;
};

export async function registerUser(input: unknown, { findUserByEmail, createUser }: RegisterDeps): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<RegisterError>(parsed.error) };
  const { name, email, password } = parsed.data;

  if (await findUserByEmail(email)) return { ok: false, error: "email_taken" };

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await createUser({ name, email, passwordHash });
    return { ok: true, userId: user.id };
  } catch (e) {
    if ((e as { code?: unknown })?.code === MONGO_DUPLICATE_KEY) {
      return { ok: false, error: "email_taken" };
    }
    throw e;
  }
}
