import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

// Folha de uma pessoa (memberId) numa unidade no mês trabalhado ("2026-10"): salário (com os
// bônus) e comissão que valem no caixa no lugar dos calculados. paidOn ("2026-11-12") é o dia
// do pagamento; null enquanto não foi pago (só ajusta o valor do mês).
const payrollPaymentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    memberId: { type: Schema.Types.ObjectId, ref: "WorkspaceMember", required: true },
    month: { type: String, required: true },
    salaryCents: { type: Number, required: true, min: 0 },
    commissionCents: { type: Number, required: true, min: 0 },
    paidOn: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { collection: "payroll_payments", timestamps: true },
);

// Um registro por pessoa, unidade e mês.
payrollPaymentSchema.index({ unitId: 1, memberId: 1, month: 1 }, { unique: true });
payrollPaymentSchema.index({ unitId: 1, month: 1 });

payrollPaymentSchema.plugin(connectOnUse);

export type PayrollPaymentDoc = InferSchemaType<typeof payrollPaymentSchema>;

export const PayrollPayment: Model<PayrollPaymentDoc> =
  models.PayrollPayment ?? model<PayrollPaymentDoc>("PayrollPayment", payrollPaymentSchema);
