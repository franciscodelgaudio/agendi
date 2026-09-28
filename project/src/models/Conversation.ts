import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";
import { MESSAGING_PLATFORMS } from "@/lib/messaging-types";

// Conversa com um cliente num canal. contactExternalId é o wa_id (WhatsApp) ou o id do
// cliente no escopo da conta (Instagram). lastInboundAt abre a janela de 24h para responder.
const conversationSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    channelId: { type: Schema.Types.ObjectId, ref: "MessagingChannel", required: true },
    platform: { type: String, enum: MESSAGING_PLATFORMS, required: true },
    contactExternalId: { type: String, required: true },
    contactName: { type: String, default: null, trim: true },
    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: null },
    lastInboundAt: { type: Date, default: null },
    unreadCount: { type: Number, default: 0, min: 0 },
    // Encerrada pela equipe ou pela URA; volta a open quando o cliente escreve.
    status: { type: String, enum: ["open", "closed"], default: "open" },
    // Quem atende depois de a URA transferir; null = na fila da equipe. Sai ao encerrar.
    assignedUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // Com atendente (ou na fila depois da URA transferir), a URA não inicia sozinha.
    handedOff: { type: Boolean, default: false },
  },
  { collection: "conversations", timestamps: true },
);

conversationSchema.index({ channelId: 1, contactExternalId: 1 }, { unique: true });
conversationSchema.index({ workspaceId: 1, lastMessageAt: -1 });

conversationSchema.plugin(connectOnUse);

export type ConversationDoc = InferSchemaType<typeof conversationSchema>;

export const Conversation: Model<ConversationDoc> =
  models.Conversation ?? model<ConversationDoc>("Conversation", conversationSchema);
