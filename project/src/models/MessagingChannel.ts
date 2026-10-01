import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";
import { MESSAGING_PLATFORMS } from "@/service/workspace/[workspaceId]/inbox/messaging-types";

// Número do WhatsApp Business ou conta profissional do Instagram conectada a um workspace.
// externalId é o phone_number_id (WhatsApp) ou o id da conta (Instagram): é por ele que o
// webhook encontra o canal. O token de acesso fica encriptado (lib/secret-box).
const messagingChannelSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    platform: { type: String, enum: MESSAGING_PLATFORMS, required: true },
    name: { type: String, required: true, trim: true },
    externalId: { type: String, required: true, trim: true },
    accessTokenEncrypted: { type: String, required: true, select: false },
  },
  { collection: "messaging_channels", timestamps: true },
);

// Um número ou conta só pode estar conectado a um workspace.
messagingChannelSchema.index({ platform: 1, externalId: 1 }, { unique: true });

messagingChannelSchema.plugin(connectOnUse);

export type MessagingChannelDoc = InferSchemaType<typeof messagingChannelSchema>;

export const MessagingChannel: Model<MessagingChannelDoc> =
  models.MessagingChannel ?? model<MessagingChannelDoc>("MessagingChannel", messagingChannelSchema);
