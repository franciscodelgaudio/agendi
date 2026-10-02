import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

// Grupo de despesas da unidade ou da carteira (impostos, insumos, aluguel...). O limite é do gasto previsto
// por mês, em centavos; null = sem limite. monthlyLimitCents vale até a primeira mudança, e cada
// mudança vale do mês dela ("AAAA-MM") até a seguinte. O ícone vem do catálogo expense_group_icons.
const limitChangeSchema = new Schema(
  {
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    cents: { type: Number, default: null, min: 1 },
  },
  { _id: false },
);

const expenseGroupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    monthlyLimitCents: { type: Number, default: null, min: 1 },
    limitChanges: { type: [limitChangeSchema], default: [] },
    iconId: { type: Schema.Types.ObjectId, ref: "ExpenseGroupIcon", required: true },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", default: null },
    // Grupo da carteira: o planejamento em conjunto das unidades dela.
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", default: null },
  },
  { collection: "expense_groups", timestamps: true },
);

// Dono: a unidade ou a carteira, nunca as duas.
expenseGroupSchema.pre("validate", function () {
  if (!this.unitId === !this.walletId) this.invalidate("unitId", "Informe a unidade ou a carteira.");
});

// Nome único na unidade ou na carteira, sem diferenciar maiúsculas nem acentos.
const PT_COLLATION = { locale: "pt", strength: 1 };
expenseGroupSchema.index(
  { unitId: 1, name: 1 },
  { unique: true, collation: PT_COLLATION, partialFilterExpression: { unitId: { $type: "objectId" } } },
);
expenseGroupSchema.index(
  { walletId: 1, name: 1 },
  { unique: true, collation: PT_COLLATION, partialFilterExpression: { walletId: { $type: "objectId" } } },
);

expenseGroupSchema.plugin(connectOnUse);

export type ExpenseGroupDoc = InferSchemaType<typeof expenseGroupSchema>;

export const ExpenseGroup: Model<ExpenseGroupDoc> =
  models.ExpenseGroup ?? model<ExpenseGroupDoc>("ExpenseGroup", expenseGroupSchema);
