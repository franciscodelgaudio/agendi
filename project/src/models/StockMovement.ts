import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

// purchase: entrou no estoque; adjustment: diminuiu na edição; depletion: uma unidade do
// produto acabou; transfer: foi de unitId para toUnitId.
export const STOCK_MOVEMENT_KINDS = ["purchase", "adjustment", "depletion", "transfer"] as const;

// Cada mudança na quantidade de um produto, com a unidade que fez: no estoque compartilhado é
// o que mostra o que cada unidade repôs e consumiu.
const stockMovementSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    stockId: { type: Schema.Types.ObjectId, ref: "Stock", default: null },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    kind: { type: String, enum: STOCK_MOVEMENT_KINDS, required: true },
    // Sempre positiva; o tipo diz se entrou ou saiu.
    quantity: { type: Number, required: true, min: 1 },
    toUnitId: { type: Schema.Types.ObjectId, ref: "Unit", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { collection: "stock_movements", timestamps: { createdAt: true, updatedAt: false } },
);

stockMovementSchema.index({ productId: 1, createdAt: -1 });
stockMovementSchema.index({ unitId: 1, createdAt: -1 });

stockMovementSchema.plugin(connectOnUse);

export type StockMovementDoc = InferSchemaType<typeof stockMovementSchema>;

export const StockMovement: Model<StockMovementDoc> =
  models.StockMovement ?? model<StockMovementDoc>("StockMovement", stockMovementSchema);
