import bcrypt from "bcryptjs";

type StoredUser = {
  id: string;
  name?: string | null;
  email: string;
  image?: string | null;
  passwordHash?: string | null;
};

export async function verifyCredentials(
  input: unknown,
  findUserByEmail: (email: string) => Promise<StoredUser | null>,
) {
  const { email, password } = (input ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || typeof password !== "string") return null;

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return null;

  const user = await findUserByEmail(normalizedEmail);
  if (!user?.passwordHash) return null;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return null;

  return { id: user.id, name: user.name, email: user.email, image: user.image };
}
