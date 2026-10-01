import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/service/_shared/database/mongoose";

// Produto usado, com cópia do nome do momento da escolha. Não mexe na quantidade em estoque.
const selectedProductSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
  },
  { _id: false },
);

// Agendamento de um hóspede com um profissional numa unidade, exibido no calendário.
// Os nomes do profissional e do serviço são cópias do momento do agendamento.
const bookingSchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: "Unit", required: true },
    // Usuário que vai atender: o proprietário ou um membro cuja função realiza atendimentos.
    therapistId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    therapistName: { type: String, required: true },
    guest: {
      name: { type: String, required: true, trim: true },
      room: { type: String, required: true, trim: true },
    },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    service: {
      type: new Schema(
        {
          serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true },
          serviceName: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    // Sala da unidade onde acontece o atendimento; o nome é cópia do momento do agendamento.
    treatmentRoom: {
      type: new Schema(
        {
          roomId: { type: Schema.Types.ObjectId, required: true },
          roomName: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
    },
    products: { type: [selectedProductSchema], default: [] },
    // Cor no calendário, uma da paleta; null usa a cor do profissional.
    color: { type: String, default: null },
    // Atendimento registrado a partir deste agendamento; enquanto null, ainda pode ser editado.
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment", default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { collection: "bookings", timestamps: true },
);

// O calendário filtra por unidades e intervalo; a checagem de conflito, por profissional e intervalo.
bookingSchema.index({ unitId: 1, startsAt: 1 });
bookingSchema.index({ therapistId: 1, startsAt: 1 });
// A ocupação de cada sala.
bookingSchema.index({ "treatmentRoom.roomId": 1, startsAt: 1 });
// O uso de cada produto no estoque.
bookingSchema.index({ "products.productId": 1 });

bookingSchema.plugin(connectOnUse);

export type BookingDoc = InferSchemaType<typeof bookingSchema>;

export const Booking: Model<BookingDoc> = models.Booking ?? model<BookingDoc>("Booking", bookingSchema);
