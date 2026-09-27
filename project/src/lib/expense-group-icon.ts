// Catálogo padrão de ícones dos grupos de despesas; key é o ícone desenhado na tela.
// Entra no banco na primeira leitura com a coleção vazia.
export const EXPENSE_GROUP_ICONS = [
  { key: "receipt", name: "Impostos", color: "#dc2626" },
  { key: "package", name: "Insumos", color: "#ea580c" },
  { key: "house", name: "Aluguel", color: "#1f5a4e" },
  { key: "zap", name: "Energia", color: "#ca8a04" },
  { key: "droplet", name: "Água", color: "#0284c7" },
  { key: "wifi", name: "Internet", color: "#2563eb" },
  { key: "users", name: "Salários", color: "#7c3aed" },
  { key: "megaphone", name: "Marketing", color: "#db2777" },
  { key: "wrench", name: "Manutenção", color: "#57534e" },
  { key: "sparkles", name: "Limpeza", color: "#0d9488" },
  { key: "car", name: "Transporte", color: "#4f46e5" },
  { key: "utensils", name: "Alimentação", color: "#d97706" },
  { key: "landmark", name: "Taxas bancárias", color: "#475569" },
  { key: "shield", name: "Seguro", color: "#059669" },
  { key: "graduation-cap", name: "Cursos", color: "#9333ea" },
  { key: "shopping-cart", name: "Compras", color: "#16a34a" },
  { key: "smartphone", name: "Telefone", color: "#0891b2" },
  { key: "file-text", name: "Contador", color: "#65a30d" },
  { key: "heart-pulse", name: "Saúde", color: "#e11d48" },
  { key: "tag", name: "Outros", color: "#71717a" },
] as const;

export type ExpenseGroupIcon = { id: string; key: string; name: string; color: string };

type ExpenseGroupIconSeed = (typeof EXPENSE_GROUP_ICONS)[number] & { order: number };

// find devolve o catálogo já ordenado.
export async function listExpenseGroupIcons({
  find,
  insertMany,
}: {
  find: () => Promise<ExpenseGroupIcon[]>;
  insertMany: (icons: ExpenseGroupIconSeed[]) => Promise<ExpenseGroupIcon[]>;
}): Promise<ExpenseGroupIcon[]> {
  const icons = await find();
  if (icons.length > 0) return icons;
  return insertMany(EXPENSE_GROUP_ICONS.map((icon, order) => ({ ...icon, order })));
}
