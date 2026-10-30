import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

const workspaceMemberSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    tokenHash: { type: String, unique: true, sparse: true },
    expiresAt: Date,
    acceptedAt: Date,
  },
  { collection: "workspace_members", timestamps: true },
);

workspaceMemberSchema.index({ workspaceId: 1, email: 1 }, { unique: true });

workspaceMemberSchema.plugin(connectOnUse);

export type WorkspaceMemberDoc = InferSchemaType<typeof workspaceMemberSchema>;

export const WorkspaceMember: Model<WorkspaceMemberDoc> =
  models.WorkspaceMember ?? model<WorkspaceMemberDoc>("WorkspaceMember", workspaceMemberSchema);
