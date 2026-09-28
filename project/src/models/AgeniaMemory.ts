import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

// Fato ou preferência que a AgenIA guardou sobre o workspace; entra no contexto de toda conversa.
const ageniaMemorySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    content: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { collection: "agenia_memories", timestamps: true },
);

ageniaMemorySchema.plugin(connectOnUse);

export type AgeniaMemoryDoc = InferSchemaType<typeof ageniaMemorySchema>;

export const AgeniaMemory: Model<AgeniaMemoryDoc> =
  models.AgeniaMemory ?? model<AgeniaMemoryDoc>("AgeniaMemory", ageniaMemorySchema);
