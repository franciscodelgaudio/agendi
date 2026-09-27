import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

// Ícone que um grupo de despesas pode usar. key é o desenho (mapeado na tela) e color o fundo;
// order é a posição na grade de escolha.
const expenseGroupIconSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    color: { type: String, required: true },
    order: { type: Number, required: true },
  },
  { collection: "expense_group_icons", timestamps: true },
);

expenseGroupIconSchema.plugin(connectOnUse);

export type ExpenseGroupIconDoc = InferSchemaType<typeof expenseGroupIconSchema>;

export const ExpenseGroupIcon: Model<ExpenseGroupIconDoc> =
  models.ExpenseGroupIcon ?? model<ExpenseGroupIconDoc>("ExpenseGroupIcon", expenseGroupIconSchema);
