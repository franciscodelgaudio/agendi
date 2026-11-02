export type ReceivableData = { name: string; valueCents: number; accruedAt: Date };

export function appointmentReceivable(appointment: {
  name: string;
  customerName: string | null;
  priceCents: number;
  startsAt: Date;
}): ReceivableData | null {
  if (appointment.priceCents <= 0) return null;
  return {
    name: appointment.customerName ? `${appointment.name} · ${appointment.customerName}` : appointment.name,
    valueCents: appointment.priceCents,
    accruedAt: appointment.startsAt,
  };
}
