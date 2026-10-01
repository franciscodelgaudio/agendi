import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

// Valor em caixa no início do dia `date` ("2026-09-01"); o saldo soma o líquido real a partir dele.
const openingBalanceSchema = new Schema(
  {
    amountCents: { type: Number, required: true, min: 0 },
    date: { type: String, required: true },
  },
  { _id: false },
);

// amountCents: parte do saldo inicial da unidade; null em todas quando a carteira é compartilhada.
const walletUnitSchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    amountCents: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

// Conta de onde entra e sai o dinheiro de uma ou mais unidades. Cada unidade fica em uma
// carteira só.
const walletSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    openingBalance: { type: openingBalanceSchema, required: true },
    units: { type: [walletUnitSchema], default: [] },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  },
  { collection: "wallets", timestamps: true },
);

walletSchema.index({ "units.unitId": 1 });

walletSchema.plugin(connectOnUse);

export type WalletDoc = InferSchemaType<typeof walletSchema>;

export const Wallet: Model<WalletDoc> = models.Wallet ?? model<WalletDoc>("Wallet", walletSchema);
