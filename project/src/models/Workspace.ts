import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";
import { UNIT_PAGES, WORKSPACE_PAGES } from "@/lib/page-access";
import { PLAN_IDS } from "@/lib/plans";

// Páginas ocultas para uma função; o proprietário e administradores sempre veem tudo.
const rolePagesSchema = new Schema(
  {
    workspace: { type: [{ type: String, enum: WORKSPACE_PAGES }], default: [] },
    unit: { type: [{ type: String, enum: UNIT_PAGES }], default: [] },
  },
  { _id: false },
);

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
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subscription: { type: subscriptionSchema, default: null },
    // Modelo da AgenIA (id do catálogo em agenia-models); ausente = o primeiro disponível.
    ageniaModel: { type: String },
    // Ausente = tudo liberado.
    hiddenPages: {
      massage_therapist: { type: rolePagesSchema },
      receptionist: { type: rolePagesSchema },
    },
  },
  { collection: "workspaces", timestamps: true },
);

workspaceSchema.plugin(connectOnUse);

export type WorkspaceDoc = InferSchemaType<typeof workspaceSchema>;

export const Workspace: Model<WorkspaceDoc> =
  models.Workspace ?? model<WorkspaceDoc>("Workspace", workspaceSchema);
