import { describe, it, expect, vi } from "vitest";
import { createWallet, deleteWallet, updateWallet } from "@/service/workspace/[workspaceId]/cash-flow/wallet";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";

const MANAGER = actorWith("cash_flow.manage");

describe("createWallet", () => {
  function makeDeps() {
    return { insert: vi.fn().mockResolvedValue({ id: WALLET_ID }) };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: ADMIN };

  it("cria a carteira no workspace sem saldo inicial", async () => {
    const deps = makeDeps();

    const result = await createWallet({ name: "Conta Itaú" }, ctx, deps);

    expect(result).toEqual({ ok: true, walletId: WALLET_ID });
    expect(deps.insert).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, name: "Conta Itaú", openingBalance: null });
  });

  it("com saldo inicial, leva o valor em centavos e o dia", async () => {
    const deps = makeDeps();

    await createWallet(
      { name: "  Conta Itaú  ", openingBalance: { amount: "2500.00", date: "2026-09-01" } },
      { workspaceId: WORKSPACE_ID, actor: MANAGER },
      deps,
    );

    expect(deps.insert).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      name: "Conta Itaú",
      openingBalance: { amountCents: 250_000, date: "2026-09-01" },
    });
  });

  it("saldo inicial sem valor fica sem saldo", async () => {
    const deps = makeDeps();

    await createWallet({ name: "Conta", openingBalance: { amount: "", date: "" } }, ctx, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ openingBalance: null }));
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome ausente", {}, "invalid_input"],
    ["nome que não é texto", { name: 1 }, "invalid_input"],
    ["nome vazio", { name: "  " }, "invalid_name"],
    ["nome com mais de 40 caracteres", { name: "a".repeat(41) }, "name_too_long"],
    ["saldo inválido", { name: "Conta", openingBalance: { amount: "abc", date: "2026-09-01" } }, "invalid_opening_balance"],
    ["dia do saldo inválido", { name: "Conta", openingBalance: { amount: "10", date: "2026-02-30" } }, "invalid_opening_balance_date"],
  ])("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createWallet(input, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar o caixa", STAFF, "forbidden"],
  ] as const)("%s, não cria", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await createWallet({ name: "Conta" }, { workspaceId: WORKSPACE_ID, actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateWallet", () => {
  function makeDeps(found = true) {
    return { update: vi.fn().mockResolvedValue(found) };
  }

  it("renomeia a carteira", async () => {
    const deps = makeDeps();

    const result = await updateWallet({ name: " Conta Nubank " }, WALLET_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(WALLET_ID, { name: "Conta Nubank" });
  });

  it("recusa nome vazio sem gravar", async () => {
    const deps = makeDeps();

    const result = await updateWallet({ name: "" }, WALLET_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_name" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("sem id (%j), devolve não encontrada", async (walletId) => {
    const deps = makeDeps();

    const result = await updateWallet({ name: "Conta" }, walletId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "wallet_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("devolve não encontrada quando a carteira não é do workspace", async () => {
    const result = await updateWallet({ name: "Conta" }, WALLET_ID, { actor: ADMIN }, makeDeps(false));

    expect(result).toEqual({ ok: false, error: "wallet_not_found" });
  });

  it("sem a permissão de gerenciar o caixa, não renomeia", async () => {
    const deps = makeDeps();

    const result = await updateWallet({ name: "Conta" }, WALLET_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("deleteWallet", () => {
  function makeDeps({ hasUnits = false, hasTransactions = false, found = true } = {}) {
    return {
      hasUnits: vi.fn().mockResolvedValue(hasUnits),
      hasTransactions: vi.fn().mockResolvedValue(hasTransactions),
      remove: vi.fn().mockResolvedValue(found),
    };
  }

  it("exclui a carteira sem unidades nem transações", async () => {
    const deps = makeDeps();

    const result = await deleteWallet(WALLET_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(WALLET_ID);
  });

  it("não exclui a carteira que alguma unidade usa", async () => {
    const deps = makeDeps({ hasUnits: true });

    const result = await deleteWallet(WALLET_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "wallet_in_use" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("não exclui a carteira com transações", async () => {
    const deps = makeDeps({ hasTransactions: true });

    const result = await deleteWallet(WALLET_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "wallet_has_transactions" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("sem id (%j), devolve não encontrada", async (walletId) => {
    const deps = makeDeps();

    const result = await deleteWallet(walletId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "wallet_not_found" });
    expect(deps.hasUnits).not.toHaveBeenCalled();
  });

  it("devolve não encontrada quando a remoção não acha a carteira", async () => {
    const result = await deleteWallet(WALLET_ID, { actor: ADMIN }, makeDeps({ found: false }));

    expect(result).toEqual({ ok: false, error: "wallet_not_found" });
  });

  it("sem a permissão de gerenciar o caixa, não exclui", async () => {
    const deps = makeDeps();

    const result = await deleteWallet(WALLET_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
