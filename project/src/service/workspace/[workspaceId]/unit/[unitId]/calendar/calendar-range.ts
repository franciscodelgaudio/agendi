import type { BusinessHours } from "@/service/workspace/[workspaceId]/unit/[unitId]/business-hours"

// Faixa de horas visível no calendário: do horário de funcionamento (o mais amplo entre as
// unidades), arredondado para horas cheias, com uma hora a mais de cada lado.
export function calendarRange(hours: BusinessHours[]): { start: string; end: string } {
  if (!hours.length) return { start: "00:00", end: "24:00" }
  const opens = Math.min(...hours.map(({ opensAt }) => Number(opensAt.slice(0, 2))))
  const closes = Math.max(...hours.map(({ closesAt }) => Math.ceil(toMinutes(closesAt) / 60)))
  return { start: toTime(Math.max(opens - 1, 0)), end: toTime(Math.min(closes + 1, 24)) }
}

function toMinutes(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}

function toTime(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`
}
