import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

// Compra que ainda tem unidades no estoque, com o preço pago por unidade. O estoque sai pelo
// PEPS: o lote mais antigo primeiro.
const lotSchema = new Schema(
  {
    quantity: { type: Number, required: true, min: 1 },
    unitCostCents: { type: Number, required: true, min: 0 },
    purchasedAt: { type: Date, required: true },
  },
  { _id: false },
);

// Quantidade de um produto do catálogo num estoque. holderId é o estoque: o compartilhado
// (Stock) das unidades que estão num, ou a própria unidade (Unit) das que não estão.
const stockItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    holderId: { type: Schema.Types.ObjectId, required: true },
    // Soma dos lotes, guardada para listar e ordenar sem abrir os lotes.
    quantity: { type: Number, required: true, min: 0 },
    // Em ordem de compra.
    lots: { type: [lotSchema], default: [] },
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
