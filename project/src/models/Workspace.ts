import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import { PLAN_IDS } from "@/service/subscribe/plans";

// Plano pago pela AbacatePay; sem assinatura ativa, o workspace mostra a tela de planos.
const subscriptionSchema = new Schema(
  {
    planId: { type: String, enum: PLAN_IDS, required: true },
    status: { type: String, enum: ["active"], required: true },
    paidAt: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
  },
  { _id: false },
);

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, trim: true },
    // Quem criou (pagou) o workspace; não dá acesso: o acesso vem de workspace_members.
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subscription: { type: subscriptionSchema, default: null },
    // Modelo da AgenIA (id do catálogo em agenia-models); ausente = o primeiro disponível.
    ageniaModel: { type: String },
  },
  { collection: "workspaces", timestamps: true },
);

workspaceSchema.plugin(connectOnUse);

export type WorkspaceDoc = InferSchemaType<typeof workspaceSchema>;

export const Workspace: Model<WorkspaceDoc> =
  models.Workspace ?? model<WorkspaceDoc>("Workspace", workspaceSchema);
