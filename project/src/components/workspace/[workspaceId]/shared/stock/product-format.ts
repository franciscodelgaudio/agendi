// Formatação do uso de produtos na interface.

const averageFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })

// null = o produto ainda não acabou nenhuma vez.
export function formatAverage(average: number | null) {
  if (average === null) return "—"
  return `${averageFormat.format(average)} ${average === 1 ? "uso" : "usos"}`
}

export function formatUses(uses: number) {
  return `${uses} ${uses === 1 ? "uso" : "usos"}`
}
