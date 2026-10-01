import { describe, it, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcryptjs";
import { verifyCredentials } from "@/service/(auth)/login/credentials";

const PASSWORD = "senha-correta-123";
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

function storedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Ana",
    email: "ana@example.com",
    image: null,
    passwordHash,
    ...overrides,
  };
}

describe("verifyCredentials", () => {
  it("retorna o usuário (sem passwordHash) quando email e senha estão corretos", async () => {
    const find = vi.fn().mockResolvedValue(storedUser());

    const result = await verifyCredentials(
      { email: "ana@example.com", password: PASSWORD },
      find,
    );

    expect(result).toEqual({
      id: "user-1",
      name: "Ana",
      email: "ana@example.com",
      image: null,
    });
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("normaliza o email (trim + minúsculas) antes de buscar", async () => {
    const find = vi.fn().mockResolvedValue(storedUser());

    await verifyCredentials({ email: "  Ana@Example.COM ", password: PASSWORD }, find);

    expect(find).toHaveBeenCalledWith("ana@example.com");
  });

  it("retorna null quando o usuário não existe", async () => {
    const find = vi.fn().mockResolvedValue(null);

    const result = await verifyCredentials(
      { email: "ninguem@example.com", password: PASSWORD },
      find,
    );

    expect(result).toBeNull();
  });

  it("retorna null quando a senha está errada", async () => {
    const find = vi.fn().mockResolvedValue(storedUser());

    const result = await verifyCredentials(
      { email: "ana@example.com", password: "senha-errada" },
      find,
    );

    expect(result).toBeNull();
  });

  it("retorna null quando a conta não tem senha (ex: criada via Google)", async () => {
    const find = vi.fn().mockResolvedValue(storedUser({ passwordHash: undefined }));

    const result = await verifyCredentials(
      { email: "ana@example.com", password: PASSWORD },
      find,
    );

    expect(result).toBeNull();
  });

  it.each([
    ["credenciais ausentes", undefined],
    ["sem email", { password: PASSWORD }],
    ["sem senha", { email: "ana@example.com" }],
    ["email vazio", { email: "   ", password: PASSWORD }],
    ["senha vazia", { email: "ana@example.com", password: "" }],
    ["tipos inválidos", { email: 123, password: ["x"] }],
  ])("retorna null sem consultar o banco quando a entrada é inválida (%s)", async (_, input) => {
    const find = vi.fn();

    const result = await verifyCredentials(input, find);

    expect(result).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });
});
