import { describe, it, expect, vi } from "vitest";
import { EXPENSE_GROUP_ICONS, listExpenseGroupIcons } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-group-icon";

const saved = [
  { id: "64b7f0c2a1b2c3d4e5f60760", key: "receipt", name: "Impostos", color: "#dc2626" },
  { id: "64b7f0c2a1b2c3d4e5f60761", key: "package", name: "Insumos", color: "#ea580c" },
];

describe("EXPENSE_GROUP_ICONS", () => {
  it("cada ícone padrão tem key única, nome e cor em hexadecimal", () => {
    const keys = EXPENSE_GROUP_ICONS.map((icon) => icon.key);

    expect(EXPENSE_GROUP_ICONS.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
    for (const icon of EXPENSE_GROUP_ICONS) {
      expect(icon.name.trim()).not.toBe("");
      expect(icon.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("listExpenseGroupIcons", () => {
  it("devolve os ícones do banco sem inserir nada quando o catálogo já existe", async () => {
    const deps = { find: vi.fn().mockResolvedValue(saved), insertMany: vi.fn() };

    const result = await listExpenseGroupIcons(deps);

    expect(result).toEqual(saved);
    expect(deps.insertMany).not.toHaveBeenCalled();
  });

  it("com o catálogo vazio, insere os ícones padrão na ordem da lista e devolve os inseridos", async () => {
    const inserted = EXPENSE_GROUP_ICONS.map((icon, index) => ({ id: `id-${index}`, ...icon }));
    const deps = { find: vi.fn().mockResolvedValue([]), insertMany: vi.fn().mockResolvedValue(inserted) };

    const result = await listExpenseGroupIcons(deps);

    expect(deps.insertMany).toHaveBeenCalledWith(EXPENSE_GROUP_ICONS.map((icon, order) => ({ ...icon, order })));
    expect(result).toEqual(inserted);
  });
});
