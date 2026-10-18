import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

// Cliente recorrente da empresa (workspace). cpf e phones só com dígitos.
const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    cpf: { type: String, required: true },
    phones: { type: [String], default: [] },
    email: { type: String, default: null },
    notes: { type: String, default: null },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
  },
  { collection: "customers", timestamps: true },
);

// O CPF identifica o cliente na empresa (ADR-040); o índice garante mesmo com cadastros simultâneos.
customerSchema.index({ workspaceId: 1, cpf: 1 }, { unique: true });
// Lista e busca por nome.
customerSchema.index({ workspaceId: 1, name: 1 });

customerSchema.plugin(connectOnUse);

export type CustomerDoc = InferSchemaType<typeof customerSchema>;

export const Customer: Model<CustomerDoc> = models.Customer ?? model<CustomerDoc>("Customer", customerSchema);
