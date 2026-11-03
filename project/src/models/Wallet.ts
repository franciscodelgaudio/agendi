import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

const walletSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  },
  { collection: "wallets", timestamps: true },
);

walletSchema.plugin(connectOnUse);

export type WalletDoc = InferSchemaType<typeof walletSchema>;

export const Wallet: Model<WalletDoc> = models.Wallet ?? model<WalletDoc>("Wallet", walletSchema);
