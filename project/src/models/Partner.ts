import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import { THRESHOLD_RULES } from "@/service/workspace/[workspaceId]/unit/[unitId]/partner";

const partnerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    thresholdRule: { type: String, enum: THRESHOLD_RULES, required: true },
    tiers: {
      type: [
        {
          _id: false,
          thresholdCents: { type: Number, required: true, min: 0 },
          shareBps: { type: Number, required: true, min: 0, max: 9999 },
        },
      ],
      required: true,
      validate: { validator: (tiers: unknown[]) => tiers.length > 0 },
    },
    imageUrl: { type: String, default: null, trim: true },
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", default: null },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  },
  { collection: "partners", timestamps: true },
);

partnerSchema.index({ unitId: 1 }, { unique: true, partialFilterExpression: { unitId: { $type: "objectId" } } });

partnerSchema.plugin(connectOnUse);

export type PartnerDoc = InferSchemaType<typeof partnerSchema>;

export const Partner: Model<PartnerDoc> = models.Partner ?? model<PartnerDoc>("Partner", partnerSchema);
