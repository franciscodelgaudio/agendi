import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";
import { URA_NODE_TYPES } from "@/lib/ura-nodes";

// Fluxo automático de atendimento (URA) de um workspace, montado no editor visual.
// O grafo é validado e normalizado por lib/ura-graph antes de salvar; data de cada
// nó tem o formato de UraNodeData. Salvar substitui o fluxo em uso.
const uraSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true },
    active: { type: Boolean, default: false },
    nodes: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            type: { type: String, enum: URA_NODE_TYPES, required: true },
            position: { x: { type: Number, required: true }, y: { type: Number, required: true } },
            data: { type: Schema.Types.Mixed, default: {} },
          },
          { _id: false, minimize: false },
        ),
      ],
      default: [],
    },
    edges: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            source: { type: String, required: true },
            target: { type: String, required: true },
            sourceHandle: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { collection: "uras", timestamps: true },
);

uraSchema.index({ workspaceId: 1, createdAt: 1 });

uraSchema.plugin(connectOnUse);

export type UraDoc = InferSchemaType<typeof uraSchema>;

export const Ura: Model<UraDoc> = models.Ura ?? model<UraDoc>("Ura", uraSchema);
