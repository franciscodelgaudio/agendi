import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

// Parte do produto que está numa unidade do estoque distribuído.
const unitQuantitySchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

// Produto em estoque. O custo fica em centavos para evitar erro de arredondamento.
const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    costCents: { type: Number, required: true, min: 0 },
    notes: { type: String, default: null, trim: true },
    // Avaliação em estrelas (1 a 5); null = sem avaliação.
    rating: { type: Number, default: null, min: 1, max: 5 },
    // Imagem do produto (futuramente enviada para uma CDN).
    avatarUrl: { type: String, default: null, trim: true },
    // Cada vez que uma unidade do produto acabou; fecha um ciclo de uso.
    depletedAt: { type: [Date], default: [] },
    // Unidade que cadastrou; fora de qualquer estoque (stockId null), é a dona do produto.
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    // Estoque de várias unidades em que o produto está; null = só da unidade.
    stockId: { type: Schema.Types.ObjectId, ref: "Stock", default: null },
    // Só no estoque distribuído: a parte de cada unidade, que soma quantity.
    unitQuantities: { type: [unitQuantitySchema], default: [] },
  },
  { collection: "products", timestamps: true },
);

// Lista e busca do seletor: produtos da unidade em ordem de nome, com o trecho do nome
// conferido nas chaves do índice, sem ler os documentos.
productSchema.index({ unitId: 1, name: 1 });
productSchema.index({ stockId: 1, name: 1 });

productSchema.plugin(connectOnUse);

export type ProductDoc = InferSchemaType<typeof productSchema>;

export const Product: Model<ProductDoc> = models.Product ?? model<ProductDoc>("Product", productSchema);
