import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

const stationSchema = new Schema({
  name: { type: String, required: true, trim: true },
  active: { type: Boolean, default: true },
});

const businessHoursSchema = new Schema(
  {
    opensAt: { type: String, required: true },
    closesAt: { type: String, required: true },
  },
  { _id: false },
);

const unitSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, default: null, trim: true },
    stations: { type: [stationSchema], default: [] },
    businessHours: { type: businessHoursSchema, required: true },
    workspaceMemberIds: { type: [Schema.Types.ObjectId], ref: "WorkspaceMember", default: [], index: true },
    walletId: { type: Schema.Types.ObjectId, ref: "Wallet", default: null, index: true },
    inventoryId: { type: Schema.Types.ObjectId, ref: "Inventory", default: null, index: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
  },
  { collection: "units", timestamps: true },
);

unitSchema.plugin(connectOnUse);

export type UnitDoc = InferSchemaType<typeof unitSchema>;

export const Unit: Model<UnitDoc> = models.Unit ?? model<UnitDoc>("Unit", unitSchema);
