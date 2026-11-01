import { Schema, model, models, type InferSchemaType, type Model, type Types } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import {
  APPOINTMENT_STATUSES,
  type AppointmentCustomer,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment";

const appointmentCustomerSchema = new Schema(
  { kind: { type: String, enum: ["registered", "guest"], required: true } },
  { _id: false, discriminatorKey: "kind" },
);

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
    customer: { type: appointmentCustomerSchema, default: null },
    workspaceMemberId: { type: Schema.Types.ObjectId, ref: "WorkspaceMember", required: true },
    stationId: { type: Schema.Types.ObjectId, required: true },
  },
  { collection: "appointments", timestamps: true },
);

const customerPath = appointmentSchema.path<Schema.Types.Subdocument>("customer");
customerPath.discriminator(
  "registered",
  new Schema({ customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true } }, { _id: false }),
);
customerPath.discriminator(
  "guest",
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      observation: { type: String, default: null, trim: true },
    },
    { _id: false },
  ),
);

appointmentSchema.index({ "customer.customerId": 1 }, { sparse: true });
appointmentSchema.index({ unitId: 1, startsAt: 1 });
appointmentSchema.index({ workspaceMemberId: 1, startsAt: 1 });
appointmentSchema.index({ stationId: 1, startsAt: 1 });
appointmentSchema.index({ workspaceId: 1, startsAt: -1 });

appointmentSchema.plugin(connectOnUse);

type StoredCustomer =
  | { kind: "registered"; customerId: Types.ObjectId }
  | Extract<AppointmentCustomer, { kind: "guest" }>;

export type AppointmentDoc = Omit<InferSchemaType<typeof appointmentSchema>, "customer"> & {
  customer: StoredCustomer | null;
};

export const Appointment: Model<AppointmentDoc> =
  models.Appointment ?? model<AppointmentDoc>("Appointment", appointmentSchema);
