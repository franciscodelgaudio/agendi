import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

// Contato enviado pelo formulário da landing, para a equipe da Agendi responder pelo WhatsApp.
const leadSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Só dígitos.
    whatsapp: { type: String, required: true },
    message: { type: String, default: null },
  },
  { collection: "leads", timestamps: true },
);

leadSchema.index({ createdAt: -1 });

leadSchema.plugin(connectOnUse);

export type LeadDoc = InferSchemaType<typeof leadSchema>;

export const Lead: Model<LeadDoc> = models.Lead ?? model<LeadDoc>("Lead", leadSchema);
