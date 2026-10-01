import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

const stockUnitSchema = new Schema(
  { unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true } },
  { _id: false },
);

// Estoque compartilhado por várias unidades: uma quantidade só de cada produto para todas
// (StockItem.holderId é o id dele). Cada unidade fica em um estoque só; a que não está em
// nenhum tem o próprio (holderId é o id da unidade).
const stockSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    units: { type: [stockUnitSchema], default: [] },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  },
  { collection: "stocks", timestamps: true },
);

stockSchema.index({ "units.unitId": 1 });

stockSchema.plugin(connectOnUse);

export type StockDoc = InferSchemaType<typeof stockSchema>;

export const Stock: Model<StockDoc> = models.Stock ?? model<StockDoc>("Stock", stockSchema);
