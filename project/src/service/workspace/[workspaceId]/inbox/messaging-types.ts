// Sem dependências de servidor: também é importado por componentes de cliente.
export const MESSAGING_PLATFORMS = ["whatsapp", "instagram"] as const;
export type MessagingPlatform = (typeof MESSAGING_PLATFORMS)[number];

export const MESSAGE_TYPES = ["text", "image", "video", "audio", "document", "sticker", "other"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export type MessageDirection = "inbound" | "outbound";

// Só mensagens enviadas têm status; as recebidas ficam com null.
export const DELIVERY_STATUSES = ["pending", "sent", "delivered", "read", "failed"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
