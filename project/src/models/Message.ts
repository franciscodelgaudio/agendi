import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import { DELIVERY_STATUSES, MESSAGE_TYPES } from "@/service/workspace/[workspaceId]/inbox/messaging-types";

// Mensagem de uma conversa. externalMessageId é o id da Meta (wamid / mid): fica null
// enquanto a resposta ainda não foi aceita pela API. status só existe em mensagens enviadas.
const messageSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    externalMessageId: { type: String, default: null },
    type: { type: String, enum: MESSAGE_TYPES, required: true },
    text: { type: String, default: null },
    status: { type: String, enum: [...DELIVERY_STATUSES, null], default: null },
    error: { type: String, default: null },
    sentAt: { type: Date, required: true },
    // Quem respondeu pelo sistema; null em recebidas e em ecos enviados pelo app.
    sentByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // URA que enviou a mensagem automaticamente.
    sentByUraId: { type: Schema.Types.ObjectId, ref: "Ura", default: null },
    // Link da mídia enviada pela URA (text guarda a legenda).
    mediaUrl: { type: String, default: null },
    // Opções do menu enviado pela URA (text guarda a pergunta).
    options: {
      type: [new Schema({ title: { type: String, required: true }, description: { type: String, default: null } }, { _id: false })],
      default: undefined,
    },
  },
  { collection: "messages", timestamps: true },
);

// Evita duplicar quando a Meta reenvia o webhook. Parcial porque pendentes ainda não têm id.
messageSchema.index(
  { externalMessageId: 1 },
  { unique: true, partialFilterExpression: { externalMessageId: { $type: "string" } } },
);
messageSchema.index({ conversationId: 1, sentAt: 1 });

messageSchema.plugin(connectOnUse);

export type MessageDoc = InferSchemaType<typeof messageSchema>;

export const Message: Model<MessageDoc> = models.Message ?? model<MessageDoc>("Message", messageSchema);
