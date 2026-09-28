import { describe, it, expect, vi } from "vitest";
import { sendMetaMessage } from "@/lib/meta-graph";

const TOKEN = "EAAGm0PX4ZCpsBA";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const whatsapp = {
  platform: "whatsapp" as const,
  channelExternalId: "106540352242922",
  accessToken: TOKEN,
  to: "5511988887777",
  text: "Temos horário às 15h!",
  apiVersion: "v23.0",
};

const instagram = {
  ...whatsapp,
  platform: "instagram" as const,
  channelExternalId: "17841400000000001",
  to: "6000000000000001",
};

describe("sendMetaMessage · WhatsApp", () => {
  it("envia o texto pela Cloud API do número e devolve o id da mensagem", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        messaging_product: "whatsapp",
        contacts: [{ input: "5511988887777", wa_id: "5511988887777" }],
        messages: [{ id: "wamid.OUT" }],
      }),
    );

    const result = await sendMetaMessage(whatsapp, fetchFn);

    expect(result).toEqual({ ok: true, externalMessageId: "wamid.OUT" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/106540352242922/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511988887777",
      type: "text",
      text: { preview_url: false, body: "Temos horário às 15h!" },
    });
  });
});

describe("sendMetaMessage · Instagram", () => {
  it("envia o texto pela API do Instagram da conta e devolve o id da mensagem", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(200, { recipient_id: "6000000000000001", message_id: "mid.OUT" }),
    );

    const result = await sendMetaMessage(instagram, fetchFn);

    expect(result).toEqual({ ok: true, externalMessageId: "mid.OUT" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://graph.instagram.com/v23.0/17841400000000001/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({
      recipient: { id: "6000000000000001" },
      message: { text: "Temos horário às 15h!" },
    });
  });
});

describe("sendMetaMessage · falhas", () => {
  it.each([whatsapp, instagram])("devolve a mensagem de erro da API ($platform)", async (params) => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse(400, { error: { message: "(#131047) Re-engagement message", type: "OAuthException", code: 131047 } }),
    );

    expect(await sendMetaMessage(params, fetchFn)).toEqual({
      ok: false,
      reason: "api_error",
      detail: "(#131047) Re-engagement message",
    });
  });

  it("devolve api_error sem detalhe quando o erro não tem mensagem", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(500, { oops: true }));

    expect(await sendMetaMessage(whatsapp, fetchFn)).toEqual({ ok: false, reason: "api_error", detail: null });
  });

  it("devolve api_error sem detalhe quando o erro não é JSON", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("Bad Gateway", { status: 502 }));

    expect(await sendMetaMessage(whatsapp, fetchFn)).toEqual({ ok: false, reason: "api_error", detail: null });
  });

  it("devolve network_error quando a requisição não chega à API", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    expect(await sendMetaMessage(whatsapp, fetchFn)).toEqual({ ok: false, reason: "network_error", detail: null });
  });

  it.each([
    ["WhatsApp sem messages", whatsapp, { messaging_product: "whatsapp" }],
    ["WhatsApp com messages vazio", whatsapp, { messages: [] }],
    ["Instagram sem message_id", instagram, { recipient_id: "6000000000000001" }],
  ])("devolve unexpected_response quando o sucesso vem sem id (%s)", async (_label, params, body) => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, body));

    expect(await sendMetaMessage(params, fetchFn)).toEqual({ ok: false, reason: "unexpected_response", detail: null });
  });
});

describe("sendMetaMessage · corpo pronto", () => {
  it("envia o corpo informado no lugar do texto", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { messages: [{ id: "wamid.OUT" }] }));
    const body = { messaging_product: "whatsapp", to: "5511988887777", type: "image", image: { link: "https://cdn/x.png" } };

    const result = await sendMetaMessage({ ...whatsapp, text: undefined, body }, fetchFn);

    expect(result).toEqual({ ok: true, externalMessageId: "wamid.OUT" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v23.0/106540352242922/messages");
    expect(JSON.parse(init.body)).toEqual(body);
  });
});
