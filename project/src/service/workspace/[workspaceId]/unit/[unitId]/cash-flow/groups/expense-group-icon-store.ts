import { isObjectIdOrHexString } from "mongoose";
import { listExpenseGroupIcons, type ExpenseGroupIcon as Icon } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-group-icon";
import { ExpenseGroupIcon } from "@/models/ExpenseGroupIcon";

function toIcon(doc: { _id: { toString(): string }; key: string; name: string; color: string }): Icon {
  return { id: doc._id.toString(), key: doc.key, name: doc.name, color: doc.color };
}

// Catálogo de ícones dos grupos, na ordem da grade; cria o padrão na primeira leitura.
export function loadExpenseGroupIcons() {
  return listExpenseGroupIcons({
    find: async () => (await ExpenseGroupIcon.find().sort({ order: 1 }).lean()).map(toIcon),
    insertMany: async (icons) => (await ExpenseGroupIcon.insertMany(icons)).map(toIcon),
  });
}

export async function expenseGroupIconExists(iconId: string) {
  return isObjectIdOrHexString(iconId) && !!(await ExpenseGroupIcon.exists({ _id: iconId }));
}
