import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import { MOVEMENT_TYPES } from "@/service/workspace/[workspaceId]/stock/[inventoryId]/stock-movement";

const stockMovementSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    quantity: { type: Number, required: true, min: 1 },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    inventoryId: { type: Schema.Types.ObjectId, ref: "Inventory", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  },
  { collection: "stock_movements", timestamps: { createdAt: true, updatedAt: false } },
);

stockMovementSchema.index({ inventoryId: 1, createdAt: -1 });

stockMovementSchema.plugin(connectOnUse);

export type StockMovementDoc = InferSchemaType<typeof stockMovementSchema>;

export const StockMovement: Model<StockMovementDoc> =
  models.StockMovement ?? model<StockMovementDoc>("StockMovement", stockMovementSchema);
