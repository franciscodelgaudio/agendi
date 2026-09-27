import { describe, it, expect, vi } from "vitest";
import { createExpenseGroup, deleteExpenseGroup, updateExpenseGroup } from "@/lib/expense-group";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const GROUP_ID = "64b7f0c2a1b2c3d4e5f60740";

// Como chega do FormData: o limite vem do AmountInput ("1500.00") ou vazio.
const validInput = { name: "Impostos", monthlyLimit: "1500.00" };

describe("createExpenseGroup", () => {
  function makeDeps({ taken = false } = {}) {
    return {
      insert: vi.fn().mockResolvedValue({ id: GROUP_ID }),
      isNameTaken: vi.fn().mockResolvedValue(taken),
    };
  }

  it("cria o grupo na unidade com o limite mensal em centavos", async () => {
    const deps = makeDeps();

    const result = await createExpenseGroup(validInput, UNIT_ID, deps);

    expect(result).toEqual({ ok: true, groupId: GROUP_ID });
    expect(deps.insert).toHaveBeenCalledWith({ name: "Impostos", monthlyLimitCents: 150_000, unitId: UNIT_ID });
  });

  it("sem limite, o grupo fica sem limite mensal", async () => {
    const deps = makeDeps();

    await createExpenseGroup({ name: "Insumos", monthlyLimit: "" }, UNIT_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith({ name: "Insumos", monthlyLimitCents: null, unitId: UNIT_ID });
  });

  it("remove espaços das pontas do nome e confere se ele já existe na unidade", async () => {
    const deps = makeDeps();

    await createExpenseGroup({ name: "  Aluguel  ", monthlyLimit: " 3000.00 " }, UNIT_ID, deps);

    expect(deps.isNameTaken).toHaveBeenCalledWith(UNIT_ID, "Aluguel", null);
    expect(deps.insert).toHaveBeenCalledWith({ name: "Aluguel", monthlyLimitCents: 300_000, unitId: UNIT_ID });
  });

  it("aceita nome com exatamente 40 caracteres", async () => {
    const deps = makeDeps();
    const name = "a".repeat(40);

    const result = await createExpenseGroup({ name, monthlyLimit: "" }, UNIT_ID, deps);

    expect(result).toEqual({ ok: true, groupId: GROUP_ID });
  });

  it.each([
    ["nome ausente", { monthlyLimit: "" }, "invalid_input"],
    ["limite que não é texto", { name: "Impostos", monthlyLimit: 10 }, "invalid_input"],
    ["nome vazio", { name: "   ", monthlyLimit: "" }, "invalid_name"],
    ["nome com mais de 40 caracteres", { name: "a".repeat(41), monthlyLimit: "" }, "name_too_long"],
    ["limite inválido", { name: "Impostos", monthlyLimit: "abc" }, "invalid_monthly_limit"],
    ["limite zerado", { name: "Impostos", monthlyLimit: "0.00" }, "invalid_monthly_limit"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createExpenseGroup(input, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("não cria dois grupos com o mesmo nome na unidade", async () => {
    const deps = makeDeps({ taken: true });

    const result = await createExpenseGroup(validInput, UNIT_ID, deps);

    expect(result).toEqual({ ok: false, error: "duplicate_group_name" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("unidade não encontrada quando o id é %j", async (unitId) => {
    const deps = makeDeps();

    const result = await createExpenseGroup(validInput, unitId, deps);

    expect(result).toEqual({ ok: false, error: "unit_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateExpenseGroup", () => {
  function makeDeps({ found = true, taken = false } = {}) {
    return {
      update: vi.fn().mockResolvedValue(found),
      isNameTaken: vi.fn().mockResolvedValue(taken),
    };
  }

  it("atualiza nome e limite, ignorando o próprio grupo ao conferir o nome", async () => {
    const deps = makeDeps();

    const result = await updateExpenseGroup({ name: "Impostos", monthlyLimit: "" }, UNIT_ID, GROUP_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.isNameTaken).toHaveBeenCalledWith(UNIT_ID, "Impostos", GROUP_ID);
    expect(deps.update).toHaveBeenCalledWith(GROUP_ID, { name: "Impostos", monthlyLimitCents: null });
  });

  it("não troca para o nome de outro grupo da unidade", async () => {
    const deps = makeDeps({ taken: true });

    const result = await updateExpenseGroup(validInput, UNIT_ID, GROUP_ID, deps);

    expect(result).toEqual({ ok: false, error: "duplicate_group_name" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("não salva quando o limite é inválido", async () => {
    const deps = makeDeps();

    const result = await updateExpenseGroup({ name: "Impostos", monthlyLimit: "-5" }, UNIT_ID, GROUP_ID, deps);

    expect(result).toEqual({ ok: false, error: "invalid_monthly_limit" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["sem unidade", null, GROUP_ID],
    ["sem grupo", UNIT_ID, ""],
  ])("grupo não encontrado quando %s", async (_label, unitId, groupId) => {
    const deps = makeDeps();

    const result = await updateExpenseGroup(validInput, unitId, groupId, deps);

    expect(result).toEqual({ ok: false, error: "group_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("grupo não encontrado quando ele não existe na unidade", async () => {
    const deps = makeDeps({ found: false });

    const result = await updateExpenseGroup(validInput, UNIT_ID, GROUP_ID, deps);

    expect(result).toEqual({ ok: false, error: "group_not_found" });
  });
});

describe("deleteExpenseGroup", () => {
  function makeDeps({ found = true, hasExpenses = false } = {}) {
    return {
      remove: vi.fn().mockResolvedValue(found),
      hasExpenses: vi.fn().mockResolvedValue(hasExpenses),
    };
  }

  it("exclui o grupo sem despesas", async () => {
    const deps = makeDeps();

    const result = await deleteExpenseGroup(GROUP_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.hasExpenses).toHaveBeenCalledWith(GROUP_ID);
    expect(deps.remove).toHaveBeenCalledWith(GROUP_ID);
  });

  it("não exclui grupo que ainda tem despesas", async () => {
    const deps = makeDeps({ hasExpenses: true });

    const result = await deleteExpenseGroup(GROUP_ID, deps);

    expect(result).toEqual({ ok: false, error: "group_has_expenses" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("grupo não encontrado quando o id é %j", async (groupId) => {
    const deps = makeDeps();

    const result = await deleteExpenseGroup(groupId, deps);

    expect(result).toEqual({ ok: false, error: "group_not_found" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("grupo não encontrado quando ele não existe na unidade", async () => {
    const deps = makeDeps({ found: false });

    const result = await deleteExpenseGroup(GROUP_ID, deps);

    expect(result).toEqual({ ok: false, error: "group_not_found" });
  });
});
