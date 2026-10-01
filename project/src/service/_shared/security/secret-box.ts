import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM: o tag de autenticação faz qualquer alteração no conteúdo falhar na leitura.
// Formato: "v1:" + base64url(iv | tag | texto cifrado).
const PREFIX = "v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

// A chave fica no ambiente como 32 bytes em base64 (openssl rand -base64 32).
function parseKey(key: string | undefined) {
  const bytes = Buffer.from(key ?? "", "base64");
  if (bytes.length !== 32) throw new Error("A chave de criptografia precisa ter 32 bytes em base64");
  return bytes;
}

export function encryptSecret(plain: string, key: string | undefined) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", parseKey(key), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

// null quando o conteúdo é malformado, foi alterado ou foi cifrado com outra chave.
export function decryptSecret(payload: string, key: string | undefined) {
  if (!payload.startsWith(PREFIX)) return null;
  const encoded = payload.slice(PREFIX.length);
  const bytes = Buffer.from(encoded, "base64url");
  // Buffer.from ignora caracteres inválidos e bits de sobra no fim; só aceita a forma canônica.
  if (bytes.length <= IV_BYTES + TAG_BYTES || bytes.toString("base64url") !== encoded) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", parseKey(key), bytes.subarray(0, IV_BYTES));
    decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
