import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import { TRANSACTION_TYPES } from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction";

const transactionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    totalCents: { type: Number, required: true, min: 0 },
    paidAt: { type: Date, default: null },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", default: null },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  },
  { collection: "transactions", timestamps: true },
);

transactionSchema.index({ walletId: 1, paidAt: -1 });
transactionSchema.index({ appointmentId: 1 }, { unique: true, partialFilterExpression: { appointmentId: { $type: "objectId" } } });

transactionSchema.plugin(connectOnUse);

export type TransactionDoc = InferSchemaType<typeof transactionSchema>;

export const Transaction: Model<TransactionDoc> =
  models.Transaction ?? model<TransactionDoc>("Transaction", transactionSchema);
