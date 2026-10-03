import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

// Nome, valor e duração do serviço e o nome do profissional são cópias do momento
// do registro, para que mudanças futuras não alterem o histórico.
const appointmentItemSchema = new Schema(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true },
    serviceName: { type: String, required: true },
    priceCents: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, required: true, min: 1 },
    // Usuário que fez o serviço: o proprietário ou um membro cuja função realiza atendimentos.
    // null quando o serviço não usa profissional (ex.: hidromassagem), que não gera comissão.
    therapistId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    therapistName: { type: String, default: null },
  },
  { _id: false },
);

// Produto usado, com cópia do nome do momento da escolha. Não mexe na quantidade em estoque.
const selectedProductSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
  },
  { _id: false },
);

// Desconto no total do atendimento, em % ou R$. cents é o valor descontado, já rateado no
// priceCents de cada item (que passa a ser o valor cobrado).
const discountSchema = new Schema(
  {
    type: { type: String, enum: ["percent", "amount"], required: true },
    percent: { type: Number, min: 0, max: 100 },
    cents: { type: Number, required: true, min: 0 },
    reason: { type: String, default: "", trim: true },
  },
  { _id: false },
);

// Atendimento de um hóspede numa unidade, com um ou mais serviços.
const appointmentSchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    performedAt: { type: Date, required: true },
    guest: {
      name: { type: String, required: true, trim: true },
      room: { type: String, required: true, trim: true },
    },
    items: { type: [appointmentItemSchema], required: true },
    products: { type: [selectedProductSchema], default: [] },
    discount: { type: discountSchema, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { collection: "appointments", timestamps: true },
);

// A listagem sempre filtra por unidade e costuma filtrar/ordenar pelo horário.
appointmentSchema.index({ unitId: 1, performedAt: 1 });
// O uso de cada produto no estoque.
appointmentSchema.index({ "products.productId": 1 });

appointmentSchema.plugin(connectOnUse);

export type AppointmentDoc = InferSchemaType<typeof appointmentSchema>;

export const Appointment: Model<AppointmentDoc> =
  models.Appointment ?? model<AppointmentDoc>("Appointment", appointmentSchema);
