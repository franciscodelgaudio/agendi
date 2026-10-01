// Paleta do calendário: cada profissional recebe uma cor na ordem da lista (o proprietário
// primeiro), e um agendamento pode escolher uma delas no lugar da cor do profissional.
export const BOOKING_COLORS = [
  { value: "#1f5a4e", name: "Verde-escuro" },
  { value: "#7c3aed", name: "Roxo" },
  { value: "#db2777", name: "Rosa" },
  { value: "#ea580c", name: "Laranja" },
  { value: "#16a34a", name: "Verde" },
  { value: "#2563eb", name: "Azul" },
  { value: "#ca8a04", name: "Mostarda" },
  { value: "#dc2626", name: "Vermelho" },
] as const;

export function isBookingColor(value: string) {
  return BOOKING_COLORS.some((color) => color.value === value);
}
