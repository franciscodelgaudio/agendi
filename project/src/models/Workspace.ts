import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import { UNIT_PAGES, WORKSPACE_PAGES } from "@/service/workspace/[workspaceId]/page-access";
import { PERMISSIONS } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const roleSchema = new Schema({
  name: { type: String, required: true, trim: true },
  admin: { type: Boolean, default: false },
  permissions: { type: [{ type: String, enum: PERMISSIONS }], default: [] },
  pages: {
    workspace: { type: [{ type: String, enum: WORKSPACE_PAGES }], default: [] },
    unit: { type: [{ type: String, enum: UNIT_PAGES }], default: [] },
  },
});

const workspaceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    imageUrl: { type: String, trim: true },
    roles: { type: [roleSchema], default: [] },
  },
  { collection: "workspaces", timestamps: true },
);

workspaceSchema.plugin(connectOnUse);

export type WorkspaceDoc = InferSchemaType<typeof workspaceSchema>;

export const Workspace: Model<WorkspaceDoc> =
  models.Workspace ?? model<WorkspaceDoc>("Workspace", workspaceSchema);
