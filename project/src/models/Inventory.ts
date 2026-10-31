import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

const inventoryProductSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const inventorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    products: { type: [inventoryProductSchema], default: [] },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  },
  { collection: "inventories", timestamps: true },
);

inventorySchema.index({ "products.productId": 1 });

inventorySchema.plugin(connectOnUse);

export type InventoryDoc = InferSchemaType<typeof inventorySchema>;

export const Inventory: Model<InventoryDoc> = models.Inventory ?? model<InventoryDoc>("Inventory", inventorySchema);
