// Formatação de valores de serviços e atendimentos na interface.

export const currencyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

export const timeFormat = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
})

// 90 -> "1h 30min"; 45 -> "45min"; 120 -> "2h".
export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}min`
  return rest ? `${hours}h ${rest}min` : `${hours}h`
}
