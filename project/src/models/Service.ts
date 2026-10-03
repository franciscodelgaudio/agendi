import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

// Serviço prestado numa unidade. O preço fica em centavos para evitar erro de arredondamento.
const serviceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    priceCents: { type: Number, required: true, min: 0 },
    durationMinutes: { type: Number, required: true, min: 1 },
    // Produtos que o serviço costuma usar, pré-marcados em agendamentos e atendimentos.
    productIds: { type: [{ type: Schema.Types.ObjectId, ref: "Product" }], default: [] },
    // false: serviço sem profissional (ex.: hidromassagem), que não gera comissão.
    requiresTherapist: { type: Boolean, default: true },
    // Espaços da unidade (treatmentRooms) em que o serviço pode ser feito; vazio aceita qualquer um.
    treatmentRoomIds: { type: [Schema.Types.ObjectId], default: [] },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true, index: true },
  },
  { collection: "services", timestamps: true },
);

serviceSchema.plugin(connectOnUse);

export type ServiceDoc = InferSchemaType<typeof serviceSchema>;

export const Service: Model<ServiceDoc> = models.Service ?? model<ServiceDoc>("Service", serviceSchema);
