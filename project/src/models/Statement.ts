import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

const statementSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    from: { type: Date, default: null },
    to: { type: Date, required: true },
    grossCents: { type: Number, required: true, min: 0 },
    shareBps: { type: Number, required: true, min: 0, max: 9999 },
    partnerId: { type: Schema.Types.ObjectId, ref: "Partner", required: true },
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    receivableIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "Receivable" }],
      required: true,
      validate: { validator: (ids: unknown[]) => ids.length > 0 },
    },
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
  },
  { collection: "statements", timestamps: true },
);

statementSchema.index({ partnerId: 1, to: -1 });
statementSchema.index({ walletId: 1, to: -1 });
statementSchema.index({ receivableIds: 1 }, { unique: true });
statementSchema.index({ transactionId: 1 }, { unique: true, partialFilterExpression: { transactionId: { $type: "objectId" } } });

statementSchema.plugin(connectOnUse);

export type StatementDoc = InferSchemaType<typeof statementSchema>;

export const Statement: Model<StatementDoc> = models.Statement ?? model<StatementDoc>("Statement", statementSchema);
