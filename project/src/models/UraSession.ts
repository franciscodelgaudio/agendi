import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

export const ACTIVE_SESSION_STATUSES = ["running", "waiting", "sleeping"] as const;

// Execução de uma URA numa conversa. Enquanto ativa (running, waiting ou sleeping) é a
// única da conversa; version cresce a cada rodada salva e descarta timers e rodadas antigas.
const uraSessionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    uraId: { type: Schema.Types.ObjectId, ref: "Ura", required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    status: { type: String, enum: [...ACTIVE_SESSION_STATUSES, "ended"], default: "running" },
    currentNodeId: { type: String, default: null },
    variables: { type: Schema.Types.Mixed, default: {} },
    version: { type: Number, default: 0 },
    timeoutAt: { type: Date, default: null },
    wakeAt: { type: Date, default: null },
    endReason: { type: String, enum: ["completed", "closed", "handoff", "limit", "cancelled", null], default: null },
    endedAt: { type: Date, default: null },
    // Nós percorridos, na ordem, somando todas as rodadas (os últimos 200).
    trace: { type: [String], default: [] },
  },
  { collection: "ura_sessions", timestamps: true, minimize: false },
);

// No máximo uma sessão ativa por conversa: a segunda mensagem simultânea não cria outra.
uraSessionSchema.index(
  { conversationId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: [...ACTIVE_SESSION_STATUSES] } } },
);
uraSessionSchema.index({ uraId: 1, createdAt: -1 });

uraSessionSchema.plugin(connectOnUse);

export type UraSessionDoc = InferSchemaType<typeof uraSessionSchema>;

export const UraSession: Model<UraSessionDoc> =
  models.UraSession ?? model<UraSessionDoc>("UraSession", uraSessionSchema);
