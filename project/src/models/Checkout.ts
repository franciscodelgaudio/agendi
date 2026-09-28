import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";
import { PLAN_IDS, PLAN_MODES } from "@/lib/plans";

// Cobrança de um plano na AbacatePay. O _id vai como externalId do checkout e volta no webhook;
// sem workspaceId, o pagamento ativa o workspace mais antigo do usuário (ou cria um).
const checkoutSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", default: null },
    planId: { type: String, enum: PLAN_IDS, required: true },
    mode: { type: String, enum: PLAN_MODES, required: true },
    // Centavos.
    amount: { type: Number, required: true },
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    chargeId: { type: String, default: null },
    paidAt: { type: Date, default: null },
  },
  { collection: "checkouts", timestamps: true },
);

checkoutSchema.plugin(connectOnUse);

export type CheckoutDoc = InferSchemaType<typeof checkoutSchema>;

export const Checkout: Model<CheckoutDoc> = models.Checkout ?? model<CheckoutDoc>("Checkout", checkoutSchema);
