import { Calendar } from "agendi"
import { ptBR } from "react-day-picker/locale"

// Datas fixas para o render ser determinístico (hoje = 29/10/2026).
const today = new Date(2026, 9, 29)

export const SingleDate = () => (
  <Calendar
    mode="single"
    locale={ptBR}
    today={today}
    defaultMonth={new Date(2026, 9, 1)}
    selected={new Date(2026, 9, 15)}
    className="border"
  />
)

export const DateRange = () => (
  <Calendar
    mode="range"
    locale={ptBR}
    today={today}
    defaultMonth={new Date(2026, 9, 1)}
    selected={{ from: new Date(2026, 9, 12), to: new Date(2026, 9, 18) }}
    className="border"
  />
)

export const UnavailableDays = () => (
  <Calendar
    mode="single"
    locale={ptBR}
    today={today}
    defaultMonth={new Date(2026, 10, 1)}
    selected={new Date(2026, 10, 10)}
    disabled={[{ dayOfWeek: [0] }, { before: today }]}
    className="border"
  />
)

export const MonthDropdown = () => (
  <Calendar
    mode="single"
    locale={ptBR}
    today={today}
    captionLayout="dropdown"
    startMonth={new Date(2025, 0)}
    endMonth={new Date(2027, 11)}
    defaultMonth={new Date(2026, 9, 1)}
    selected={new Date(2026, 9, 29)}
    className="border"
  />
)
