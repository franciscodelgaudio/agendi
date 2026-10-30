import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import { UNIT_PAGES, WORKSPACE_PAGES } from "@/service/workspace/[workspaceId]/page-access";
import { PERMISSIONS } from "@/service/workspace/[workspaceId]/users/permissions/permissions";


const roleSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true },
    admin: { type: Boolean, default: false },
    permissions: { type: [{ type: String, enum: PERMISSIONS }], default: [] },
    pages: {
      workspace: { type: [{ type: String, enum: WORKSPACE_PAGES }], default: [] },
      unit: { type: [{ type: String, enum: UNIT_PAGES }], default: [] },
    },
  },
  { collection: "roles", timestamps: true },
);

// Nome único por workspace, sem diferenciar maiúsculas.
roleSchema.index({ workspaceId: 1, name: 1 }, { unique: true, collation: { locale: "pt", strength: 2 } });

roleSchema.plugin(connectOnUse);

export type RoleDoc = InferSchemaType<typeof roleSchema>;

export const Role: Model<RoleDoc> = models.Role ?? model<RoleDoc>("Role", roleSchema);
