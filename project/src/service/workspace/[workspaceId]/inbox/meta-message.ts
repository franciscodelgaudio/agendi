import type { MessagingPlatform } from "@/service/workspace/[workspaceId]/inbox/messaging-types";
import type { MenuOption, Outgoing } from "@/service/workspace/[workspaceId]/uras/ura-walk";

type Body = Record<string, unknown>;

// Limites da Cloud API para mensagens interativas.
const MAX_BUTTONS = 3;
const MAX_BUTTON_TITLE = 20;
const MAX_ROW_TITLE = 24;
const MAX_ROW_DESCRIPTION = 72;
const MAX_INTERACTIVE_BODY = 1024;
const MAX_LIST_BUTTON = 20;

const INSTAGRAM_ATTACHMENTS = { image: "image", video: "video", audio: "audio", document: "file" } as const;

// Botões só cabem até 3 opções de título curto e sem descrição; o resto vira lista.
function fitsButtons(options: MenuOption[]) {
  return options.length <= MAX_BUTTONS && options.every((o) => o.title.length <= MAX_BUTTON_TITLE && !o.description);
}

function whatsappBody(to: string, outgoing: Outgoing): Body {
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to };
  switch (outgoing.kind) {
    case "text":
      return { ...base, type: "text", text: { preview_url: false, body: outgoing.text } };
    case "media": {
      const { mediaType, url, caption } = outgoing;
      return { ...base, type: mediaType, [mediaType]: { link: url, ...(caption && mediaType !== "audio" ? { caption } : {}) } };
    }
    case "menu": {
      const body = { text: outgoing.text.slice(0, MAX_INTERACTIVE_BODY) };
      if (fitsButtons(outgoing.options)) {
        const buttons = outgoing.options.map(({ id, title }) => ({ type: "reply", reply: { id, title } }));
        return { ...base, type: "interactive", interactive: { type: "button", body, action: { buttons } } };
      }
      const label = outgoing.buttonLabel.slice(0, MAX_LIST_BUTTON);
      const rows = outgoing.options.map(({ id, title, description }) => ({
        id,
        title: title.slice(0, MAX_ROW_TITLE),
        ...(description ? { description: description.slice(0, MAX_ROW_DESCRIPTION) } : {}),
      }));
      return {
        ...base,
        type: "interactive",
        interactive: { type: "list", body, action: { button: label, sections: [{ title: label, rows }] } },
      };
    }
  }
}

function instagramBodies(to: string, outgoing: Outgoing): Body[] {
  const recipient = { id: to };
  switch (outgoing.kind) {
    case "text":
      return [{ recipient, message: { text: outgoing.text } }];
    case "media": {
      const attachment = { type: INSTAGRAM_ATTACHMENTS[outgoing.mediaType], payload: { url: outgoing.url } };
      const bodies: Body[] = [{ recipient, message: { attachment } }];
      if (outgoing.caption) bodies.push({ recipient, message: { text: outgoing.caption } });
      return bodies;
    }
    case "menu": {
      const lines = outgoing.options.map(
        ({ title, description }, i) => `${i + 1}. ${title}${description ? ` — ${description}` : ""}`,
      );
      return [{ recipient, message: { text: `${outgoing.text}\n\n${lines.join("\n")}` } }];
    }
  }
}

// Corpos de envio da Graph API para uma mensagem da URA. No Instagram não há botões:
// o menu vira texto numerado e a legenda da mídia vai numa mensagem separada.
export function metaMessageBodies(platform: MessagingPlatform, to: string, outgoing: Outgoing): Body[] {
  return platform === "whatsapp" ? [whatsappBody(to, outgoing)] : instagramBodies(to, outgoing);
}
