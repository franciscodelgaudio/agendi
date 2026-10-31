import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import { APPOINTMENT_STATUSES } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment";

const appointmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    status: { type: String, enum: APPOINTMENT_STATUSES, required: true, default: "scheduled" },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    color: { type: String, default: null },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    workspaceMemberId: { type: Schema.Types.ObjectId, ref: "WorkspaceMember", required: true },
    stationId: { type: Schema.Types.ObjectId, required: true },
  },
  { collection: "appointments", timestamps: true },
);

appointmentSchema.index({ unitId: 1, startsAt: 1 });
appointmentSchema.index({ workspaceMemberId: 1, startsAt: 1 });
appointmentSchema.index({ stationId: 1, startsAt: 1 });
appointmentSchema.index({ workspaceId: 1, startsAt: -1 });

appointmentSchema.plugin(connectOnUse);

export type AppointmentDoc = InferSchemaType<typeof appointmentSchema>;

export const Appointment: Model<AppointmentDoc> =
  models.Appointment ?? model<AppointmentDoc>("Appointment", appointmentSchema);
