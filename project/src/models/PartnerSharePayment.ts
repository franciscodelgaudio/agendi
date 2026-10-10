import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

// Repasse de uma unidade pago no mês ("2026-10"). O valor continua o calculado pelo caixa; sem
// registro, o repasse do mês está pendente.
const partnerSharePaymentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    month: { type: String, required: true },
    paidAt: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { collection: "partner_share_payments", timestamps: true },
);

// Um registro por unidade e mês.
partnerSharePaymentSchema.index({ unitId: 1, month: 1 }, { unique: true });

partnerSharePaymentSchema.plugin(connectOnUse);

export type PartnerSharePaymentDoc = InferSchemaType<typeof partnerSharePaymentSchema>;

export const PartnerSharePayment: Model<PartnerSharePaymentDoc> =
  models.PartnerSharePayment ?? model<PartnerSharePaymentDoc>("PartnerSharePayment", partnerSharePaymentSchema);
