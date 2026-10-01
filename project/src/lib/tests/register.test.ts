import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import { registerUser } from "@/service/(auth)/signup/register";

const validInput = {
  name: "Ana Souza",
  email: "ana@example.com",
  password: "senha-segura-123",
};

function makeDeps(overrides: Partial<Parameters<typeof registerUser>[1]> = {}) {
  const deps = {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue({ id: "user-1" }),
  };
  return { ...deps, ...overrides } as typeof deps;
}

describe("registerUser", () => {
  it("cria o usuário e retorna o id quando os dados são válidos", async () => {
    const deps = makeDeps();

    const result = await registerUser(validInput, deps);

    expect(result).toEqual({ ok: true, userId: "user-1" });
    expect(deps.createUser).toHaveBeenCalledTimes(1);
  });

  it("normaliza email (trim + minúsculas) e nome (trim) antes de salvar", async () => {
    const deps = makeDeps();

    await registerUser(
      { ...validInput, name: "  Ana Souza  ", email: "  Ana@Example.COM " },
      deps,
    );

    expect(deps.findUserByEmail).toHaveBeenCalledWith("ana@example.com");
    expect(deps.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ana Souza", email: "ana@example.com" }),
    );
  });

  it("salva a senha como hash bcrypt, nunca em texto puro", async () => {
    const deps = makeDeps();

    await registerUser(validInput, deps);

    const saved = deps.createUser.mock.calls[0][0];
    expect(saved).not.toHaveProperty("password");
    expect(saved.passwordHash).not.toBe(validInput.password);
    expect(await bcrypt.compare(validInput.password, saved.passwordHash)).toBe(true);
  });

  it("retorna email_taken sem criar nada quando o email já existe", async () => {
    const deps = makeDeps({
      findUserByEmail: vi.fn().mockResolvedValue({ id: "existente" }),
    });

    const result = await registerUser(validInput, deps);

    expect(result).toEqual({ ok: false, error: "email_taken" });
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it("retorna email_taken quando o índice único do banco rejeita (cadastro simultâneo)", async () => {
    const deps = makeDeps({
      createUser: vi.fn().mockRejectedValue(Object.assign(new Error("E11000"), { code: 11000 })),
    });

    const result = await registerUser(validInput, deps);

    expect(result).toEqual({ ok: false, error: "email_taken" });
  });

  it("propaga erros do banco que não são de email duplicado", async () => {
    const dbError = new Error("conexão perdida");
    const deps = makeDeps({ createUser: vi.fn().mockRejectedValue(dbError) });

    await expect(registerUser(validInput, deps)).rejects.toBe(dbError);
  });

  it.each([
    ["nome vazio", { ...validInput, name: "   " }, "invalid_name"],
    ["email sem @", { ...validInput, email: "ana.example.com" }, "invalid_email"],
    ["email sem domínio", { ...validInput, email: "ana@" }, "invalid_email"],
    ["senha com menos de 8 caracteres", { ...validInput, password: "1234567" }, "password_too_short"],
    // bcrypt ignora tudo depois de 72 bytes; "é" ocupa 2 bytes em UTF-8.
    ["senha com mais de 72 bytes", { ...validInput, password: "é".repeat(37) }, "password_too_long"],
    ["credenciais ausentes", undefined, "invalid_input"],
    ["campo faltando", { name: "Ana", email: "ana@example.com" }, "invalid_input"],
    ["tipos inválidos", { name: 1, email: ["x"], password: {} }, "invalid_input"],
  ])("retorna erro sem consultar o banco quando a entrada é inválida (%s)", async (_, input, error) => {
    const deps = makeDeps();

    const result = await registerUser(input, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.findUserByEmail).not.toHaveBeenCalled();
    expect(deps.createUser).not.toHaveBeenCalled();
  });

  it("aceita senha com exatamente 8 caracteres", async () => {
    const deps = makeDeps();

    const result = await registerUser({ ...validInput, password: "12345678" }, deps);

    expect(result).toEqual({ ok: true, userId: "user-1" });
  });
});
