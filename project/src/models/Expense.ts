import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { EXPENSE_REPEATS } from "@/lib/expense";
import { connectOnUse } from "@/lib/mongoose";

// Lançamento de uma série parcelada ou recorrente; number vai de 1 a count.
const expenseSeriesSchema = new Schema(
  {
    id: { type: Schema.Types.ObjectId, required: true },
    kind: { type: String, enum: EXPENSE_REPEATS, required: true },
    number: { type: Number, required: true, min: 1 },
    count: { type: Number, required: true, min: 2 },
  },
  { _id: false },
);

// Despesa lançada na unidade. date é o dia do lançamento ("2026-09-20"), que define o período
// em que ela entra no caixa; paidAt fica null enquanto está pendente.
const expenseSchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    groupId: { type: Schema.Types.ObjectId, ref: "ExpenseGroup", required: true, index: true },
    description: { type: String, required: true, trim: true },
    amountCents: { type: Number, required: true, min: 1 },
    date: { type: String, required: true },
    paidAt: { type: Date, default: null },
    // null quando a despesa é à vista.
    series: { type: expenseSeriesSchema, default: null },
    // Produto cuja compra (aumento de estoque) gerou a despesa.
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { collection: "expenses", timestamps: true },
);

expenseSchema.index({ unitId: 1, date: 1 });
expenseSchema.index({ "series.id": 1, "series.number": 1 });

expenseSchema.plugin(connectOnUse);

export type ExpenseDoc = InferSchemaType<typeof expenseSchema>;

export const Expense: Model<ExpenseDoc> = models.Expense ?? model<ExpenseDoc>("Expense", expenseSchema);
