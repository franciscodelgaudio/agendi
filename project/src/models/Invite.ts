import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

const inviteSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    roleId: { type: Schema.Types.ObjectId, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: "invites", timestamps: true },
);

inviteSchema.index({ workspaceId: 1, email: 1 }, { unique: true });

inviteSchema.plugin(connectOnUse);

export type InviteDoc = InferSchemaType<typeof inviteSchema>;

export const Invite: Model<InviteDoc> = models.Invite ?? model<InviteDoc>("Invite", inviteSchema);
