import { Schema, model, models, type InferSchemaType, type Model, type Types } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import {
  APPOINTMENT_STATUSES,
  type AppointmentCustomer,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment";

const calendarEntrySchema = new Schema(
  {
    kind: { type: String, enum: ["appointment", "blocked"], required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    workspaceMemberId: { type: Schema.Types.ObjectId, ref: "WorkspaceMember", required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 1 },
  },
  { collection: "appointments", discriminatorKey: "kind", timestamps: true },
);

calendarEntrySchema.index({ workspaceMemberId: 1, startsAt: 1 });
calendarEntrySchema.index({ workspaceId: 1, startsAt: -1 });

calendarEntrySchema.plugin(connectOnUse);

const appointmentCustomerSchema = new Schema(
  { kind: { type: String, enum: ["registered", "guest"], required: true } },
  { _id: false, discriminatorKey: "kind" },
);

const appointmentSchema = new Schema({
  name: { type: String, required: true, trim: true },
  status: { type: String, enum: APPOINTMENT_STATUSES, required: true, default: "scheduled" },
  color: { type: String, default: null },
  unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
  serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true, index: true },
  customer: { type: appointmentCustomerSchema, default: null },
  stationId: { type: Schema.Types.ObjectId, required: true },
});

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
appointmentSchema.index({ stationId: 1, startsAt: 1 });

const appointmentBlockedSchema = new Schema({
  unitId: { type: Schema.Types.ObjectId, ref: "Unit", default: null },
  reason: { type: String, default: null, trim: true },
});

type StoredCustomer =
  | { kind: "registered"; customerId: Types.ObjectId }
  | Extract<AppointmentCustomer, { kind: "guest" }>;

type CalendarEntryBase = Omit<InferSchemaType<typeof calendarEntrySchema>, "kind">;

export type AppointmentDoc = CalendarEntryBase &
  Omit<InferSchemaType<typeof appointmentSchema>, "customer"> & {
    kind: "appointment";
    customer: StoredCustomer | null;
  };

export type AppointmentBlockedDoc = CalendarEntryBase &
  InferSchemaType<typeof appointmentBlockedSchema> & { kind: "blocked" };

export type CalendarEntryDoc = AppointmentDoc | AppointmentBlockedDoc;

export const CalendarEntry: Model<CalendarEntryDoc> =
  models.CalendarEntry ?? model<CalendarEntryDoc>("CalendarEntry", calendarEntrySchema);

export const Appointment = (CalendarEntry.discriminators?.Appointment ??
  CalendarEntry.discriminator("Appointment", appointmentSchema, "appointment")) as unknown as Model<AppointmentDoc>;

export const AppointmentBlocked = (CalendarEntry.discriminators?.AppointmentBlocked ??
  CalendarEntry.discriminator("AppointmentBlocked", appointmentBlockedSchema, "blocked")) as unknown as Model<AppointmentBlockedDoc>;
