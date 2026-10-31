import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

const serviceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    durationMinutes: { type: Number, required: true, min: 1 },
    priceCents: { type: Number, required: true, min: 0 },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  },
  { collection: "services", timestamps: true },
);

serviceSchema.index({ workspaceId: 1, unitId: 1 });

serviceSchema.plugin(connectOnUse);

export type ServiceDoc = InferSchemaType<typeof serviceSchema>;

export const Service: Model<ServiceDoc> = models.Service ?? model<ServiceDoc>("Service", serviceSchema);
