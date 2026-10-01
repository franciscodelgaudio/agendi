import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import { AI_USAGE_ACTIONS } from "@/service/workspace/[workspaceId]/ai-costs/ai-usage";

// Uma chamada a um modelo de IA (uma resposta da AgenIA, com todos os passos de ferramenta).
// costUsd vem da tabela de lib/ai-usage no momento da chamada; null quando o modelo não tem preço.
const aiUsageSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: AI_USAGE_ACTIONS, required: true },
    model: { type: String, required: true },
    rawModel: { type: String, required: true },
    inputTokens: { type: Number, required: true, min: 0 },
    cachedInputTokens: { type: Number, required: true, min: 0 },
    outputTokens: { type: Number, required: true, min: 0 },
    reasoningTokens: { type: Number, required: true, min: 0 },
    totalTokens: { type: Number, required: true, min: 0 },
    costUsd: { type: Number, default: null, min: 0 },
  },
  { collection: "ai_usages", timestamps: { createdAt: true, updatedAt: false } },
);

aiUsageSchema.index({ workspaceId: 1, createdAt: -1 });

aiUsageSchema.plugin(connectOnUse);

export type AiUsageDoc = InferSchemaType<typeof aiUsageSchema>;

export const AiUsage: Model<AiUsageDoc> = models.AiUsage ?? model<AiUsageDoc>("AiUsage", aiUsageSchema);
