import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

const workspaceMemberSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    roleId: { type: Schema.Types.ObjectId, required: true },
  },
  { collection: "workspace_members", timestamps: true },
);

workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

workspaceMemberSchema.plugin(connectOnUse);

export type WorkspaceMemberDoc = InferSchemaType<typeof workspaceMemberSchema>;

export const WorkspaceMember: Model<WorkspaceMemberDoc> =
  models.WorkspaceMember ?? model<WorkspaceMemberDoc>("WorkspaceMember", workspaceMemberSchema);
