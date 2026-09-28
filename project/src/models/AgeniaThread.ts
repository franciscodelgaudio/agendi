import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";
import { THREAD_MODES } from "@/lib/agenia-history";

// Conversa de um usuário com a AgenIA. key é o id gerado no navegador (uuid) e vira o id do chat;
// scopeId é a URA ou a conversa com cliente (null na AgenIA global). messages guarda as
// UIMessages do AI SDK como chegaram, validadas por lib/agenia-history.
const ageniaThreadSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mode: { type: String, enum: THREAD_MODES, required: true },
    scopeId: { type: Schema.Types.ObjectId, default: null },
    title: { type: String, required: true },
    messages: { type: [Schema.Types.Mixed], default: [] },
    lastMessageAt: { type: Date, required: true },
  },
  { collection: "agenia_threads", timestamps: true, minimize: false },
);

ageniaThreadSchema.index({ workspaceId: 1, userId: 1, mode: 1, scopeId: 1, lastMessageAt: -1 });

ageniaThreadSchema.plugin(connectOnUse);

export type AgeniaThreadDoc = InferSchemaType<typeof ageniaThreadSchema>;

export const AgeniaThread: Model<AgeniaThreadDoc> =
  models.AgeniaThread ?? model<AgeniaThreadDoc>("AgeniaThread", ageniaThreadSchema);
