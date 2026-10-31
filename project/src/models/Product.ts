import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    priceCents: { type: Number, required: true, min: 0 },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
  },
  { collection: "products", timestamps: true },
);

productSchema.index({ workspaceId: 1, name: 1 });

productSchema.plugin(connectOnUse);

export type ProductDoc = InferSchemaType<typeof productSchema>;

export const Product: Model<ProductDoc> = models.Product ?? model<ProductDoc>("Product", productSchema);
