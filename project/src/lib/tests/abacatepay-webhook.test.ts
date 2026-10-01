import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { isAuthorizedAbacateWebhook } from "@/service/api/webhooks/abacatepay/abacatepay-webhook";

const PUBLIC_KEY = "chave-publica-de-teste";
const SECRET = "segredo-do-webhook";
const BODY = JSON.stringify({ event: "checkout.completed", data: { checkout: { id: "bill_abc" } } });

const sign = (body: string, key = PUBLIC_KEY) => createHmac("sha256", key).update(body, "utf8").digest("base64");
const keys = { secret: SECRET, publicKey: PUBLIC_KEY };

describe("isAuthorizedAbacateWebhook", () => {
  it("segredo da URL e assinatura HMAC-SHA256 (base64) corretos → true", () => {
    expect(isAuthorizedAbacateWebhook({ rawBody: BODY, signature: sign(BODY), querySecret: SECRET }, keys)).toBe(true);
  });

  it("segredo da URL errado → false", () => {
    expect(isAuthorizedAbacateWebhook({ rawBody: BODY, signature: sign(BODY), querySecret: "outro" }, keys)).toBe(false);
  });

  it("sem segredo na URL → false", () => {
    expect(isAuthorizedAbacateWebhook({ rawBody: BODY, signature: sign(BODY), querySecret: null }, keys)).toBe(false);
  });

  it("assinatura de outro corpo → false", () => {
    expect(isAuthorizedAbacateWebhook({ rawBody: BODY, signature: sign(`${BODY} `), querySecret: SECRET }, keys)).toBe(false);
  });

  it("assinatura com outra chave → false", () => {
    expect(isAuthorizedAbacateWebhook({ rawBody: BODY, signature: sign(BODY, "outra"), querySecret: SECRET }, keys)).toBe(false);
  });

  it("sem assinatura → false", () => {
    expect(isAuthorizedAbacateWebhook({ rawBody: BODY, signature: null, querySecret: SECRET }, keys)).toBe(false);
  });

  it("segredo não configurado no ambiente → false, mesmo com tudo vazio", () => {
    expect(
      isAuthorizedAbacateWebhook({ rawBody: BODY, signature: sign(BODY), querySecret: "" }, { ...keys, secret: undefined }),
    ).toBe(false);
  });
});
