import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

// Agenda travada de um profissional: ele não atende no intervalo, em nenhuma unidade do workspace.
// O nome do profissional é cópia do momento da trava.
const therapistBlockSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    therapistId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    therapistName: { type: String, required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    reason: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { collection: "therapist_blocks", timestamps: true },
);

// O calendário filtra por workspace e intervalo; a checagem do agendamento, por profissional e intervalo.
therapistBlockSchema.index({ workspaceId: 1, startsAt: 1 });
therapistBlockSchema.index({ therapistId: 1, startsAt: 1 });

therapistBlockSchema.plugin(connectOnUse);

export type TherapistBlockDoc = InferSchemaType<typeof therapistBlockSchema>;

export const TherapistBlock: Model<TherapistBlockDoc> =
  models.TherapistBlock ?? model<TherapistBlockDoc>("TherapistBlock", therapistBlockSchema);
