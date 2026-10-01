import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

// Produto do catálogo do workspace, cadastrado uma vez só. A quantidade fica em cada estoque
// (StockItem). O custo fica em centavos para evitar erro de arredondamento.
const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    costCents: { type: Number, required: true, min: 0 },
    notes: { type: String, default: null, trim: true },
    // Avaliação em estrelas (1 a 5); null = sem avaliação.
    rating: { type: Number, default: null, min: 1, max: 5 },
    // Imagem do produto (futuramente enviada para uma CDN).
    avatarUrl: { type: String, default: null, trim: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
  },
  { collection: "products", timestamps: true },
);

// Lista e busca do seletor: produtos do workspace em ordem de nome, com o trecho do nome
// conferido nas chaves do índice, sem ler os documentos.
productSchema.index({ workspaceId: 1, name: 1 });

productSchema.plugin(connectOnUse);

export type ProductDoc = InferSchemaType<typeof productSchema>;

export const Product: Model<ProductDoc> = models.Product ?? model<ProductDoc>("Product", productSchema);
