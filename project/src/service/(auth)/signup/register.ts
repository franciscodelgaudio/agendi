import bcrypt from "bcryptjs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
// bcrypt ignora tudo depois de 72 bytes.
const MAX_PASSWORD_BYTES = 72;
const MONGO_DUPLICATE_KEY = 11000;

export type RegisterError =
  | "invalid_input"
  | "invalid_name"
  | "invalid_email"
  | "password_too_short"
  | "password_too_long"
  | "email_taken";

export type RegisterResult =
  | { ok: true; userId: string }
  | { ok: false; error: RegisterError };

type RegisterDeps = {
  findUserByEmail: (email: string) => Promise<{ id: string } | null>;
  createUser: (data: {
    name: string;
    email: string;
    passwordHash: string;
  }) => Promise<{ id: string }>;
};

export async function registerUser(
  input: unknown,
  { findUserByEmail, createUser }: RegisterDeps,
): Promise<RegisterResult> {
  const { name, email, password } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || typeof email !== "string" || typeof password !== "string") {
    return { ok: false, error: "invalid_input" };
  }

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (!EMAIL_PATTERN.test(normalizedEmail)) return { ok: false, error: "invalid_email" };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "password_too_short" };
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return { ok: false, error: "password_too_long" };
  }

  if (await findUserByEmail(normalizedEmail)) return { ok: false, error: "email_taken" };

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await createUser({ name: normalizedName, email: normalizedEmail, passwordHash });
    return { ok: true, userId: user.id };
  } catch (e) {
    if ((e as { code?: unknown })?.code === MONGO_DUPLICATE_KEY) {
      return { ok: false, error: "email_taken" };
    }
    throw e;
  }
}
