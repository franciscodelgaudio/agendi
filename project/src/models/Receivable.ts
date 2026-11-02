import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

const receivableSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    valueCents: { type: Number, required: true, min: 0 },
    accruedAt: { type: Date, required: true },
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", default: null },
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", default: null },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  },
  { collection: "receivables", timestamps: true },
);

receivableSchema.index({ walletId: 1, unitId: 1, accruedAt: -1 });
receivableSchema.index({ appointmentId: 1 }, { unique: true, partialFilterExpression: { appointmentId: { $type: "objectId" } } });

receivableSchema.plugin(connectOnUse);

export type ReceivableDoc = InferSchemaType<typeof receivableSchema>;

export const Receivable: Model<ReceivableDoc> =
  models.Receivable ?? model<ReceivableDoc>("Receivable", receivableSchema);
