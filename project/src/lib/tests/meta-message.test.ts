import { describe, it, expect } from "vitest";
import { metaMessageBodies } from "@/service/workspace/[workspaceId]/inbox/meta-message";

const TO = "5511988887777";
const WA = { messaging_product: "whatsapp", recipient_type: "individual", to: TO };
const IG = { recipient: { id: TO } };

const menu = (options: { id: string; title: string; description: string | null }[], text = "Como posso ajudar?") => ({
  kind: "menu" as const,
  text,
  buttonLabel: "Ver opções",
  options,
});

describe("metaMessageBodies · WhatsApp", () => {
  it("monta texto sem prévia de link", () => {
    expect(metaMessageBodies("whatsapp", TO, { kind: "text", text: "Oi!" })).toEqual([
      { ...WA, type: "text", text: { preview_url: false, body: "Oi!" } },
    ]);
  });

  it("monta mídia pelo link, com legenda quando há", () => {
    expect(
      metaMessageBodies("whatsapp", TO, { kind: "media", mediaType: "image", url: "https://cdn/x.png", caption: "Preços" }),
    ).toEqual([{ ...WA, type: "image", image: { link: "https://cdn/x.png", caption: "Preços" } }]);
    expect(
      metaMessageBodies("whatsapp", TO, { kind: "media", mediaType: "document", url: "https://cdn/x.pdf", caption: null }),
    ).toEqual([{ ...WA, type: "document", document: { link: "https://cdn/x.pdf" } }]);
  });

  it("áudio nunca leva legenda", () => {
    expect(metaMessageBodies("whatsapp", TO, { kind: "media", mediaType: "audio", url: "https://cdn/a.ogg", caption: "x" })).toEqual([
      { ...WA, type: "audio", audio: { link: "https://cdn/a.ogg" } },
    ]);
  });

  it("menu com até 3 opções curtas vira botões", () => {
    const options = [
      { id: "opt_0", title: "Agendar", description: null },
      { id: "opt_1", title: "Preços", description: null },
    ];
    expect(metaMessageBodies("whatsapp", TO, menu(options))).toEqual([
      {
        ...WA,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: "Como posso ajudar?" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "opt_0", title: "Agendar" } },
              { type: "reply", reply: { id: "opt_1", title: "Preços" } },
            ],
          },
        },
      },
    ]);
  });

  it("menu com mais de 3 opções, descrição ou título acima de 20 caracteres vira lista", () => {
    const options = [
      { id: "slot_0", title: "ter 29/09 09:00", description: "com Ana" },
      { id: "slot_1", title: "sáb 03/10 14:30", description: null },
    ];
    expect(metaMessageBodies("whatsapp", TO, menu(options, "Escolha o horário"))).toEqual([
      {
        ...WA,
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: "Escolha o horário" },
          action: {
            button: "Ver opções",
            sections: [
              {
                title: "Ver opções",
                rows: [
                  { id: "slot_0", title: "ter 29/09 09:00", description: "com Ana" },
                  { id: "slot_1", title: "sáb 03/10 14:30" },
                ],
              },
            ],
          },
        },
      },
    ]);

    const long = [{ id: "opt_0", title: "Falar com a recepção", description: null }];
    expect(metaMessageBodies("whatsapp", TO, menu(long))[0]).toMatchObject({ interactive: { type: "button" } });
    const tooLong = [{ id: "opt_0", title: "Falar com a recepção já", description: null }];
    expect(metaMessageBodies("whatsapp", TO, menu(tooLong))[0]).toMatchObject({ interactive: { type: "list" } });
    const four = ["a", "b", "c", "d"].map((title, i) => ({ id: `opt_${i}`, title, description: null }));
    expect(metaMessageBodies("whatsapp", TO, menu(four))[0]).toMatchObject({ interactive: { type: "list" } });
  });

  it("corta o corpo do menu em 1024 caracteres e a descrição em 72", () => {
    const body = metaMessageBodies(
      "whatsapp",
      TO,
      menu([{ id: "o", title: "A", description: "d".repeat(100) }], "x".repeat(2000)),
    )[0] as { interactive: { body: { text: string }; action: { sections: { rows: { description: string }[] }[] } } };

    expect(body.interactive.body.text).toHaveLength(1024);
    expect(body.interactive.action.sections[0].rows[0].description).toHaveLength(72);
  });
});

describe("metaMessageBodies · Instagram", () => {
  it("monta texto", () => {
    expect(metaMessageBodies("instagram", TO, { kind: "text", text: "Oi!" })).toEqual([{ ...IG, message: { text: "Oi!" } }]);
  });

  it("manda a mídia como anexo e a legenda em seguida, como texto", () => {
    expect(
      metaMessageBodies("instagram", TO, { kind: "media", mediaType: "document", url: "https://cdn/x.pdf", caption: "Menu" }),
    ).toEqual([
      { ...IG, message: { attachment: { type: "file", payload: { url: "https://cdn/x.pdf" } } } },
      { ...IG, message: { text: "Menu" } },
    ]);
    expect(
      metaMessageBodies("instagram", TO, { kind: "media", mediaType: "image", url: "https://cdn/x.png", caption: null }),
    ).toEqual([{ ...IG, message: { attachment: { type: "image", payload: { url: "https://cdn/x.png" } } } }]);
  });

  it("menu vira texto numerado, com a descrição depois do título", () => {
    const options = [
      { id: "svc_1", title: "Massagem relaxante", description: "R$ 120,00 · 60 min" },
      { id: "svc_2", title: "Drenagem", description: null },
    ];
    expect(metaMessageBodies("instagram", TO, menu(options, "Qual serviço?"))).toEqual([
      { ...IG, message: { text: "Qual serviço?\n\n1. Massagem relaxante — R$ 120,00 · 60 min\n2. Drenagem" } },
    ]);
  });
});
