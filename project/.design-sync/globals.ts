// Bibliotecas expostas em window.Agendi junto com os componentes de src/components/ui:
// os ícones do lucide-react e os primitivos de gráfico do recharts (usados dentro do ChartContainer).
export * from "lucide-react"
export * from "recharts"

// lucide-react e recharts exportam alguns nomes iguais; sem esta linha o `export *` duplicado
// deixa os dois undefined. Vence o recharts — os ícones continuam com o sufixo Icon
// (BarChartIcon, PieChartIcon, TextIcon...).
export {
  AreaChart,
  BarChart,
  Brush,
  Cross,
  Dot,
  Funnel,
  LineChart,
  PieChart,
  Radar,
  ScatterChart,
  Text,
} from "recharts"
