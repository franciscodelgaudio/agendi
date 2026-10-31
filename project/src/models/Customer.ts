import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

const customerSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true },
    observation: { type: String, default: null, trim: true },
    cellphone: { type: String, default: null },
  },
  { collection: "customers", timestamps: true },
);

customerSchema.index({ workspaceId: 1, name: 1 });

customerSchema.plugin(connectOnUse);

export type CustomerDoc = InferSchemaType<typeof customerSchema>;

export const Customer: Model<CustomerDoc> = models.Customer ?? model<CustomerDoc>("Customer", customerSchema);
