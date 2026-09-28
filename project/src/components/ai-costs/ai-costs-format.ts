// Formatação e cores da tela de custos de IA.

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 })
const integer = new Intl.NumberFormat("pt-BR")
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 })

export const formatUsd = (value: number) => usd.format(value)
export const formatInteger = (value: number) => integer.format(value)
export const formatCompact = (value: number) => compact.format(value)

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })
const fullDay = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" })

export function formatBucket(bucket: string) {
  if (bucket.includes("-W")) {
    const [year, week] = bucket.split("-W")
    return `sem ${week}/${year.slice(2)}`
  }
  if (bucket.length === 7) return monthFormat.format(new Date(`${bucket}-01T12:00:00Z`))
  return dayFormat.format(new Date(`${bucket}T12:00:00Z`))
}

export const formatRange = (startDate: string, endDate: string) =>
  `${fullDay.format(new Date(`${startDate}T12:00:00Z`))} – ${fullDay.format(new Date(`${endDate}T12:00:00Z`))}`

// Paleta categórica validada (skill de dataviz) contra as superfícies do agenli, claro e escuro.
// As variáveis ficam no contêiner da tela: --ai-1 a --ai-6; "Outros" usa o cinza do tema.
export const AI_PALETTE_CLASSES =
  "[--ai-1:#2a78d6] [--ai-2:#eb6834] [--ai-3:#1baf7a] [--ai-4:#eda100] [--ai-5:#e87ba4] [--ai-6:#008300] " +
  "dark:[--ai-1:#3987e5] dark:[--ai-2:#d95926] dark:[--ai-3:#199e70] dark:[--ai-4:#c98500] dark:[--ai-5:#d55181] dark:[--ai-6:#008300]"

const SLOTS = 6
const OTHERS_COLOR = "var(--muted-foreground)"

// A cor segue a entidade (ação, modelo, usuário), não a posição no ranking: filtrar não repinta.
export function colorMap(keys: string[], fixedOrder?: readonly string[]) {
  const colors = new Map<string, string>()
  const taken = new Set<number>()
  for (const key of keys) {
    if (key === "others") {
      colors.set(key, OTHERS_COLOR)
      continue
    }
    let slot = fixedOrder?.includes(key) ? fixedOrder.indexOf(key) % SLOTS : [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 0) % SLOTS
    while (taken.has(slot) && taken.size < SLOTS) slot = (slot + 1) % SLOTS
    taken.add(slot)
    colors.set(key, `var(--ai-${slot + 1})`)
  }
  return colors
}
