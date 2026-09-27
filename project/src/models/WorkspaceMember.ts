import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";
import { MEMBER_ROLES } from "@/lib/member-role";
import { MAX_BONUS_DESCRIPTION_LENGTH } from "@/lib/unit-member";

// Bônus fixo mensal, somado ao salário no caixa.
const bonusSchema = new Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: MAX_BONUS_DESCRIPTION_LENGTH },
    amountCents: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

// Unidade em que o membro trabalha e como é pago nela: comissão, salário mensal e bônus,
// combináveis (null/vazio até ser definido na Equipe). Comissão de massagista é sobre
// os serviços que ela fez; de recepcionista, sobre o faturamento bruto da unidade.
// Salário e bônus contam a partir de startDate ("2026-02-15"); null conta sempre. O mês
// de trabalho é pago no payDay (1 a 31) do mês seguinte.
const unitLinkSchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    commissionPercent: { type: Number, default: null, min: 0, max: 100 },
    salaryCents: { type: Number, default: null, min: 1 },
    bonuses: { type: [bonusSchema], default: [] },
    startDate: { type: String, default: null },
    payDay: { type: Number, default: null, min: 1, max: 31 },
  },
  { _id: false },
);

// Membro ou convite pendente de um workspace. Enquanto userId é null, é um
// convite: tokenHash/expiresAt identificam o link enviado por email. Ao aceitar,
// userId é preenchido e o token é removido. O dono não tem documento aqui.
const workspaceMemberSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: MEMBER_ROLES, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    tokenHash: { type: String, unique: true, sparse: true },
    expiresAt: Date,
    acceptedAt: Date,
    units: { type: [unitLinkSchema], default: [] },
  },
  { collection: "workspace_members", timestamps: true },
);

// Um email só pode ser convidado/membro uma vez por workspace.
workspaceMemberSchema.index({ workspaceId: 1, email: 1 }, { unique: true });

workspaceMemberSchema.plugin(connectOnUse);

export type WorkspaceMemberDoc = InferSchemaType<typeof workspaceMemberSchema>;

export const WorkspaceMember: Model<WorkspaceMemberDoc> =
  models.WorkspaceMember ?? model<WorkspaceMemberDoc>("WorkspaceMember", workspaceMemberSchema);
