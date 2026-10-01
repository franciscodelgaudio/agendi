import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

// Quantidade de um produto do catálogo num estoque. holderId é o estoque: o compartilhado
// (Stock) das unidades que estão num, ou a própria unidade (Unit) das que não estão.
const stockItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    holderId: { type: Schema.Types.ObjectId, required: true },
    quantity: { type: Number, required: true, min: 0 },
    // Cada vez que uma unidade do produto acabou neste estoque; fecha um ciclo de uso.
    depletedAt: { type: [Date], default: [] },
  },
  { collection: "stock_items", timestamps: true },
);

// Um item por produto em cada estoque; também serve à lista do estoque.
stockItemSchema.index({ holderId: 1, productId: 1 }, { unique: true });
// Lista do catálogo: os itens de cada produto em todos os estoques.
stockItemSchema.index({ productId: 1 });

stockItemSchema.plugin(connectOnUse);

export type StockItemDoc = InferSchemaType<typeof stockItemSchema>;

export const StockItem: Model<StockItemDoc> = models.StockItem ?? model<StockItemDoc>("StockItem", stockItemSchema);
