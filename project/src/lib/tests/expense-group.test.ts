import { describe, it, expect, vi } from "vitest";
import { createExpenseGroup, deleteExpenseGroup, updateExpenseGroup, updateGroupMonthLimit } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/groups/expense-group";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const WALLET_ID = "64b7f0c2a1b2c3d4e5f60730";
// Dono do grupo: a unidade ou a carteira.
const UNIT = { unitId: UNIT_ID };
const WALLET = { walletId: WALLET_ID };
const GROUP_ID = "64b7f0c2a1b2c3d4e5f60740";
const ICON_ID = "64b7f0c2a1b2c3d4e5f60760";

// Como chega do FormData: o limite vem do AmountInput ("1500.00") ou vazio, e vale a partir
// do mês escolhido ("AAAA-MM").
const MONTH = "2026-10";
const validInput = { name: "Impostos", monthlyLimit: "1500.00", limitFrom: MONTH, iconId: ICON_ID };

describe("createExpenseGroup", () => {
  function makeDeps({ taken = false, iconExists = true } = {}) {
    return {
      insert: vi.fn().mockResolvedValue({ id: GROUP_ID }),
      isNameTaken: vi.fn().mockResolvedValue(taken),
      iconExists: vi.fn().mockResolvedValue(iconExists),
    };
  }

  it("cria o grupo na unidade com o ícone escolhido e o limite em centavos a partir do mês escolhido", async () => {
    const deps = makeDeps();

    const result = await createExpenseGroup(validInput, UNIT, deps);

    expect(result).toEqual({ ok: true, groupId: GROUP_ID });
    expect(deps.iconExists).toHaveBeenCalledWith(ICON_ID);
    // Antes do mês escolhido, o grupo fica sem limite.
    expect(deps.insert).toHaveBeenCalledWith({
      name: "Impostos",
      monthlyLimitCents: null,
      limitChanges: [{ month: MONTH, cents: 150_000 }],
      iconId: ICON_ID,
      unitId: UNIT_ID,
    });
  });

  it("sem limite, o grupo fica sem limite em nenhum mês", async () => {
    const deps = makeDeps();

    await createExpenseGroup({ name: "Insumos", monthlyLimit: "", limitFrom: MONTH, iconId: ICON_ID }, UNIT, deps);

    expect(deps.insert).toHaveBeenCalledWith({
      name: "Insumos",
      monthlyLimitCents: null,
      limitChanges: [],
      iconId: ICON_ID,
      unitId: UNIT_ID,
    });
  });

  it("remove espaços das pontas do nome e confere se ele já existe na unidade", async () => {
    const deps = makeDeps();

    await createExpenseGroup(
      { name: "  Aluguel  ", monthlyLimit: " 3000.00 ", limitFrom: MONTH, iconId: ICON_ID },
      UNIT,
      deps,
    );

    expect(deps.isNameTaken).toHaveBeenCalledWith(UNIT, "Aluguel", null);
    expect(deps.insert).toHaveBeenCalledWith({
      name: "Aluguel",
      monthlyLimitCents: null,
      limitChanges: [{ month: MONTH, cents: 300_000 }],
      iconId: ICON_ID,
      unitId: UNIT_ID,
    });
  });

  it("aceita nome com exatamente 40 caracteres", async () => {
    const deps = makeDeps();
    const name = "a".repeat(40);

    const result = await createExpenseGroup({ name, monthlyLimit: "", limitFrom: MONTH, iconId: ICON_ID }, UNIT, deps);

    expect(result).toEqual({ ok: true, groupId: GROUP_ID });
  });

  it.each([
    ["nome ausente", { monthlyLimit: "", limitFrom: MONTH, iconId: ICON_ID }, "invalid_input"],
    ["limite que não é texto", { name: "Impostos", monthlyLimit: 10, limitFrom: MONTH, iconId: ICON_ID }, "invalid_input"],
    ["nome vazio", { name: "   ", monthlyLimit: "", limitFrom: MONTH, iconId: ICON_ID }, "invalid_name"],
    [
      "nome com mais de 40 caracteres",
      { name: "a".repeat(41), monthlyLimit: "", limitFrom: MONTH, iconId: ICON_ID },
      "name_too_long",
    ],
    ["limite inválido", { name: "Impostos", monthlyLimit: "abc", limitFrom: MONTH, iconId: ICON_ID }, "invalid_monthly_limit"],
    ["limite zerado", { name: "Impostos", monthlyLimit: "0.00", limitFrom: MONTH, iconId: ICON_ID }, "invalid_monthly_limit"],
    ["mês do limite ausente", { name: "Impostos", monthlyLimit: "", iconId: ICON_ID }, "invalid_limit_month"],
    ["mês do limite inválido", { name: "Impostos", monthlyLimit: "", limitFrom: "2026-13", iconId: ICON_ID }, "invalid_limit_month"],
    ["mês do limite com dia", { name: "Impostos", monthlyLimit: "", limitFrom: "2026-10-01", iconId: ICON_ID }, "invalid_limit_month"],
    ["ícone ausente", { name: "Impostos", monthlyLimit: "", limitFrom: MONTH }, "invalid_icon"],
    ["ícone vazio", { name: "Impostos", monthlyLimit: "", limitFrom: MONTH, iconId: "" }, "invalid_icon"],
    ["ícone que não é texto", { name: "Impostos", monthlyLimit: "", limitFrom: MONTH, iconId: 5 }, "invalid_icon"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createExpenseGroup(input, UNIT, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("não cria o grupo com um ícone que não está no catálogo", async () => {
    const deps = makeDeps({ iconExists: false });

    const result = await createExpenseGroup(validInput, UNIT, deps);

    expect(result).toEqual({ ok: false, error: "invalid_icon" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("não cria dois grupos com o mesmo nome na unidade", async () => {
    const deps = makeDeps({ taken: true });

    const result = await createExpenseGroup(validInput, UNIT, deps);

    expect(result).toEqual({ ok: false, error: "duplicate_group_name" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("cria o grupo na carteira, sem unidade, conferindo o nome entre os grupos da carteira", async () => {
    const deps = makeDeps();

    const result = await createExpenseGroup(validInput, WALLET, deps);

    expect(result).toEqual({ ok: true, groupId: GROUP_ID });
    expect(deps.isNameTaken).toHaveBeenCalledWith(WALLET, "Impostos", null);
    expect(deps.insert).toHaveBeenCalledWith({
      name: "Impostos",
      monthlyLimitCents: null,
      limitChanges: [{ month: MONTH, cents: 150_000 }],
      iconId: ICON_ID,
      walletId: WALLET_ID,
    });
  });

  it.each([null, undefined, { unitId: "" }, { walletId: "" }])("dono não encontrado quando é %j", async (owner) => {
    const deps = makeDeps();

    const result = await createExpenseGroup(validInput, owner, deps);

    expect(result).toEqual({ ok: false, error: "owner_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateExpenseGroup", () => {
  function makeDeps({ found = true, taken = false, iconExists = true } = {}) {
    return {
      update: vi.fn().mockResolvedValue(found),
      isNameTaken: vi.fn().mockResolvedValue(taken),
      iconExists: vi.fn().mockResolvedValue(iconExists),
    };
  }

  it("atualiza nome e ícone e tira o limite a partir do mês escolhido, ignorando o próprio grupo ao conferir o nome", async () => {
    const deps = makeDeps();

    const result = await updateExpenseGroup(
      { name: "Impostos", monthlyLimit: "", limitFrom: "2026-11", iconId: ICON_ID },
      UNIT,
      GROUP_ID,
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.isNameTaken).toHaveBeenCalledWith(UNIT, "Impostos", GROUP_ID);
    expect(deps.iconExists).toHaveBeenCalledWith(ICON_ID);
    expect(deps.update).toHaveBeenCalledWith(
      GROUP_ID,
      { name: "Impostos", iconId: ICON_ID },
      { month: "2026-11", cents: null },
    );
  });

  it("muda o limite a partir do mês escolhido", async () => {
    const deps = makeDeps();

    await updateExpenseGroup({ ...validInput, monthlyLimit: "150.00", limitFrom: "2026-11" }, UNIT, GROUP_ID, deps);

    expect(deps.update).toHaveBeenCalledWith(
      GROUP_ID,
      { name: "Impostos", iconId: ICON_ID },
      { month: "2026-11", cents: 15_000 },
    );
  });

  it("não salva sem o mês a partir do qual o limite vale", async () => {
    const deps = makeDeps();

    const result = await updateExpenseGroup({ ...validInput, limitFrom: "" }, UNIT, GROUP_ID, deps);

    expect(result).toEqual({ ok: false, error: "invalid_limit_month" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("não troca para um ícone que não está no catálogo", async () => {
    const deps = makeDeps({ iconExists: false });

    const result = await updateExpenseGroup(validInput, UNIT, GROUP_ID, deps);

    expect(result).toEqual({ ok: false, error: "invalid_icon" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("não troca para o nome de outro grupo da unidade", async () => {
    const deps = makeDeps({ taken: true });

    const result = await updateExpenseGroup(validInput, UNIT, GROUP_ID, deps);

    expect(result).toEqual({ ok: false, error: "duplicate_group_name" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("não salva quando o limite é inválido", async () => {
    const deps = makeDeps();

    const result = await updateExpenseGroup(
      { name: "Impostos", monthlyLimit: "-5", limitFrom: MONTH, iconId: ICON_ID },
      UNIT,
      GROUP_ID,
      deps,
    );

    expect(result).toEqual({ ok: false, error: "invalid_monthly_limit" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("na carteira, confere o nome entre os grupos da carteira", async () => {
    const deps = makeDeps();

    const result = await updateExpenseGroup(validInput, WALLET, GROUP_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.isNameTaken).toHaveBeenCalledWith(WALLET, "Impostos", GROUP_ID);
  });

  it.each([
    ["sem dono", null, GROUP_ID],
    ["sem id da carteira", { walletId: "" }, GROUP_ID],
    ["sem grupo", UNIT, ""],
  ])("grupo não encontrado quando %s", async (_label, owner, groupId) => {
    const deps = makeDeps();

    const result = await updateExpenseGroup(validInput, owner, groupId, deps);

    expect(result).toEqual({ ok: false, error: "group_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("grupo não encontrado quando ele não existe na unidade", async () => {
    const deps = makeDeps({ found: false });

    const result = await updateExpenseGroup(validInput, UNIT, GROUP_ID, deps);

    expect(result).toEqual({ ok: false, error: "group_not_found" });
  });
});

describe("updateGroupMonthLimit", () => {
  // Edição de uma célula da tabela mês a mês: o limite vem como o do AmountInput ("150.00") ou vazio.
  function makeDeps({ found = true } = {}) {
    return { setMonthLimit: vi.fn().mockResolvedValue(found) };
  }

  it("muda o limite do grupo só no mês, em centavos", async () => {
    const deps = makeDeps();

    const result = await updateGroupMonthLimit({ month: "2026-11", limit: "150.00" }, UNIT, GROUP_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.setMonthLimit).toHaveBeenCalledWith(GROUP_ID, "2026-11", 15_000);
  });

  it("limite vazio deixa o mês sem limite", async () => {
    const deps = makeDeps();

    await updateGroupMonthLimit({ month: "2026-11", limit: " " }, UNIT, GROUP_ID, deps);

    expect(deps.setMonthLimit).toHaveBeenCalledWith(GROUP_ID, "2026-11", null);
  });

  it.each([
    ["limite inválido", { month: "2026-11", limit: "abc" }, "invalid_monthly_limit"],
    ["limite zerado", { month: "2026-11", limit: "0.00" }, "invalid_monthly_limit"],
    ["limite que não é texto", { month: "2026-11", limit: 150 }, "invalid_input"],
    ["mês ausente", { limit: "150.00" }, "invalid_limit_month"],
    ["mês inválido", { month: "2026-13", limit: "150.00" }, "invalid_limit_month"],
    ["mês com dia", { month: "2026-11-01", limit: "150.00" }, "invalid_limit_month"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await updateGroupMonthLimit(input, UNIT, GROUP_ID, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.setMonthLimit).not.toHaveBeenCalled();
  });

  it("muda o limite de um grupo da carteira", async () => {
    const deps = makeDeps();

    const result = await updateGroupMonthLimit({ month: "2026-11", limit: "150.00" }, WALLET, GROUP_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.setMonthLimit).toHaveBeenCalledWith(GROUP_ID, "2026-11", 15_000);
  });

  it.each([
    ["sem dono", null, GROUP_ID],
    ["sem id da carteira", { walletId: "" }, GROUP_ID],
    ["sem grupo", UNIT, ""],
  ])("grupo não encontrado quando %s", async (_label, owner, groupId) => {
    const deps = makeDeps();

    const result = await updateGroupMonthLimit({ month: "2026-11", limit: "150.00" }, owner, groupId, deps);

    expect(result).toEqual({ ok: false, error: "group_not_found" });
    expect(deps.setMonthLimit).not.toHaveBeenCalled();
  });

  it("grupo não encontrado quando ele não existe na unidade", async () => {
    const deps = makeDeps({ found: false });

    const result = await updateGroupMonthLimit({ month: "2026-11", limit: "150.00" }, UNIT, GROUP_ID, deps);

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
