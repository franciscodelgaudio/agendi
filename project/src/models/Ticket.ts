import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";
import { TICKET_STATUSES, TICKET_TYPES } from "@/lib/ticket";

// Bug ou sugestão de melhoria enviada para a equipe da Agenli. O workspace é só o
// contexto de onde o usuário abriu; o status é mudado pela equipe direto no banco.
const ticketSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: TICKET_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    status: { type: String, enum: TICKET_STATUSES, default: "open" },
  },
  { collection: "tickets", timestamps: true },
);

ticketSchema.index({ userId: 1, createdAt: -1 });

ticketSchema.plugin(connectOnUse);

export type TicketDoc = InferSchemaType<typeof ticketSchema>;

export const Ticket: Model<TicketDoc> = models.Ticket ?? model<TicketDoc>("Ticket", ticketSchema);
