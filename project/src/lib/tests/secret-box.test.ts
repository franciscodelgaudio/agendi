import { randomBytes } from "node:crypto";
import { describe, it, expect } from "vitest";
import { decryptSecret, encryptSecret } from "@/service/_shared/security/secret-box";

// Chave como fica no ambiente: 32 bytes em base64 (openssl rand -base64 32).
const KEY = randomBytes(32).toString("base64");
const OTHER_KEY = randomBytes(32).toString("base64");
const TOKEN = "EAAGm0PX4ZCpsBAKZCxyz123";

describe("encryptSecret / decryptSecret", () => {
  it("decripta de volta o texto original", () => {
    expect(decryptSecret(encryptSecret(TOKEN, KEY), KEY)).toBe(TOKEN);
  });

  it("gera um resultado diferente a cada chamada para o mesmo texto", () => {
    expect(encryptSecret(TOKEN, KEY)).not.toBe(encryptSecret(TOKEN, KEY));
  });

  it("não deixa o texto original visível no resultado", () => {
    expect(encryptSecret(TOKEN, KEY)).not.toContain(TOKEN);
  });

  it("retorna null ao decriptar com outra chave", () => {
    expect(decryptSecret(encryptSecret(TOKEN, KEY), OTHER_KEY)).toBeNull();
  });

  it("retorna null quando o conteúdo cifrado foi alterado", () => {
    const payload = encryptSecret(TOKEN, KEY);
    const last = payload.at(-1) === "A" ? "B" : "A";
    expect(decryptSecret(payload.slice(0, -1) + last, KEY)).toBeNull();
  });

  it.each(["", "abc", "v1:", "v1:!!!", "v2:AAAA"])("retorna null para conteúdo malformado (%j)", (payload) => {
    expect(decryptSecret(payload, KEY)).toBeNull();
  });

  it.each([undefined, "", "curta", randomBytes(16).toString("base64")])(
    "lança erro quando a chave não tem 32 bytes (%j)",
    (key) => {
      expect(() => encryptSecret(TOKEN, key)).toThrow();
    },
  );
});
