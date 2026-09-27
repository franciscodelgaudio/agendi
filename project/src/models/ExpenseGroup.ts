import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

// Grupo de despesas da unidade (impostos, insumos, aluguel...). O limite é do gasto previsto
// por mês, em centavos; null = sem limite.
const expenseGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    monthlyLimitCents: { type: Number, default: null, min: 1 },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
  },
  { collection: "expense_groups", timestamps: true },
);

// Nome único na unidade, sem diferenciar maiúsculas nem acentos.
expenseGroupSchema.index({ unitId: 1, name: 1 }, { unique: true, collation: { locale: "pt", strength: 1 } });

expenseGroupSchema.plugin(connectOnUse);

export type ExpenseGroupDoc = InferSchemaType<typeof expenseGroupSchema>;

export const ExpenseGroup: Model<ExpenseGroupDoc> =
  models.ExpenseGroup ?? model<ExpenseGroupDoc>("ExpenseGroup", expenseGroupSchema);
