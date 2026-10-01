import { describe, it, expect, vi } from "vitest";
import { createWallet, deleteWallet, updateWallet, walletBalance } from "@/lib/wallet";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const WALLET_ID = "64b7f0c2a1b2c3d4e5f60780";
const UNIT_A = "64b7f0c2a1b2c3d4e5f60720";
const UNIT_B = "64b7f0c2a1b2c3d4e5f60721";
const UNIT_C = "64b7f0c2a1b2c3d4e5f60722";

// Como chega do FormData: o saldo vem do AmountInput ("1000.00") com o dia, as unidades
// marcadas vêm com o valor distribuído a cada uma (vazio quando a carteira não é distribuída).
const BALANCE = { amount: "1000.00", date: "2026-09-01" };
const shared = {
  name: "Itaú",
  openingBalance: BALANCE,
  distributed: null,
  units: [
    { unitId: UNIT_A, amount: "" },
    { unitId: UNIT_B, amount: "" },
  ],
};
const distributed = {
  name: "Itaú",
  openingBalance: BALANCE,
  distributed: "on",
  units: [
    { unitId: UNIT_A, amount: "600.00" },
    { unitId: UNIT_B, amount: "400.00" },
  ],
};

function makeDeps({ exist = true, inOtherWallet = false } = {}) {
  return {
    insert: vi.fn().mockResolvedValue({ id: WALLET_ID }),
    update: vi.fn().mockResolvedValue(true),
    unitsExist: vi.fn().mockResolvedValue(exist),
    unitsInOtherWallet: vi.fn().mockResolvedValue(inOtherWallet),
  };
}

describe("createWallet", () => {
  it("cria a carteira compartilhada, sem valor por unidade", async () => {
    const deps = makeDeps();

    const result = await createWallet(shared, WORKSPACE_ID, deps);

    expect(result).toEqual({ ok: true, walletId: WALLET_ID });
    expect(deps.insert).toHaveBeenCalledWith({
      name: "Itaú",
      openingBalance: { amountCents: 100_000, date: "2026-09-01" },
      units: [
        { unitId: UNIT_A, amountCents: null },
        { unitId: UNIT_B, amountCents: null },
      ],
      workspaceId: WORKSPACE_ID,
    });
  });

  it("cria a carteira distribuída, com o valor de cada unidade em centavos", async () => {
    const deps = makeDeps();

    await createWallet(distributed, WORKSPACE_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        units: [
          { unitId: UNIT_A, amountCents: 60_000 },
          { unitId: UNIT_B, amountCents: 40_000 },
        ],
      }),
    );
  });

  it("na carteira distribuída, unidade sem valor fica com zero", async () => {
    const deps = makeDeps();

    await createWallet(
      { ...distributed, units: [{ unitId: UNIT_A, amount: "600.00" }, { unitId: UNIT_B, amount: " " }] },
      WORKSPACE_ID,
      deps,
    );

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        units: [
          { unitId: UNIT_A, amountCents: 60_000 },
          { unitId: UNIT_B, amountCents: 0 },
        ],
      }),
    );
  });

  it("aceita distribuir menos que o saldo (o resto fica não distribuído)", async () => {
    const deps = makeDeps();

    const result = await createWallet(
      { ...distributed, units: [{ unitId: UNIT_A, amount: "300.00" }] },
      WORKSPACE_ID,
      deps,
    );

    expect(result).toEqual({ ok: true, walletId: WALLET_ID });
  });

  it("na carteira compartilhada, ignora valores que vierem nas unidades", async () => {
    const deps = makeDeps();

    await createWallet({ ...shared, units: [{ unitId: UNIT_A, amount: "abc" }] }, WORKSPACE_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith(
      expect.objectContaining({ units: [{ unitId: UNIT_A, amountCents: null }] }),
    );
  });

  it("remove espaços das pontas do nome", async () => {
    const deps = makeDeps();

    await createWallet({ ...shared, name: "  Itaú  " }, WORKSPACE_ID, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ name: "Itaú" }));
  });

  it("confere as unidades no workspace, sem excluir nenhuma carteira da checagem", async () => {
    const deps = makeDeps();

    await createWallet(shared, WORKSPACE_ID, deps);

    expect(deps.unitsExist).toHaveBeenCalledWith(WORKSPACE_ID, [UNIT_A, UNIT_B]);
    expect(deps.unitsInOtherWallet).toHaveBeenCalledWith([UNIT_A, UNIT_B], null);
  });

  it("sem workspace, não grava", async () => {
    const deps = makeDeps();

    expect(await createWallet(shared, null, deps)).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([
    ["nome vazio", { ...shared, name: "   " }, "invalid_name"],
    ["nome com mais de 40 caracteres", { ...shared, name: "a".repeat(41) }, "name_too_long"],
    ["nome que não é texto", { ...shared, name: 1 }, "invalid_input"],
    ["saldo vazio", { ...shared, openingBalance: { amount: "", date: "2026-09-01" } }, "invalid_opening_balance"],
    ["saldo inválido", { ...shared, openingBalance: { amount: "-1", date: "2026-09-01" } }, "invalid_opening_balance"],
    ["dia do saldo inválido", { ...shared, openingBalance: { amount: "10", date: "" } }, "invalid_opening_balance_date"],
    ["sem unidades", { ...shared, units: [] }, "no_units"],
    ["unidades que não são lista", { ...shared, units: "x" }, "invalid_input"],
    ["unidade repetida", { ...shared, units: [{ unitId: UNIT_A, amount: "" }, { unitId: UNIT_A, amount: "" }] }, "invalid_input"],
    ["id de unidade inválido", { ...shared, units: [{ unitId: "x", amount: "" }] }, "invalid_units"],
    [
      "valor da unidade inválido",
      { ...distributed, units: [{ unitId: UNIT_A, amount: "1,50" }] },
      "invalid_unit_amount",
    ],
    [
      "distribuição maior que o saldo",
      { ...distributed, units: [{ unitId: UNIT_A, amount: "600.00" }, { unitId: UNIT_B, amount: "400.01" }] },
      "distribution_exceeds_balance",
    ],
  ])("recusa %s", async (_label, input, error) => {
    const deps = makeDeps();

    expect(await createWallet(input, WORKSPACE_ID, deps)).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("recusa unidade que não é do workspace", async () => {
    const deps = makeDeps({ exist: false });

    expect(await createWallet(shared, WORKSPACE_ID, deps)).toEqual({ ok: false, error: "invalid_units" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("recusa unidade que já está em outra carteira", async () => {
    const deps = makeDeps({ inOtherWallet: true });

    expect(await createWallet(shared, WORKSPACE_ID, deps)).toEqual({ ok: false, error: "unit_in_other_wallet" });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateWallet", () => {
  it("grava nome, saldo e unidades da carteira", async () => {
    const deps = makeDeps();

    const result = await updateWallet(distributed, WORKSPACE_ID, WALLET_ID, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(WALLET_ID, {
      name: "Itaú",
      openingBalance: { amountCents: 100_000, date: "2026-09-01" },
      units: [
        { unitId: UNIT_A, amountCents: 60_000 },
        { unitId: UNIT_B, amountCents: 40_000 },
      ],
    });
  });

  it("a própria carteira não conta como outra na checagem das unidades", async () => {
    const deps = makeDeps();

    await updateWallet(shared, WORKSPACE_ID, WALLET_ID, deps);

    expect(deps.unitsInOtherWallet).toHaveBeenCalledWith([UNIT_A, UNIT_B], WALLET_ID);
  });

  it("recusa unidade que já está em outra carteira", async () => {
    const deps = makeDeps({ inOtherWallet: true });

    expect(await updateWallet(shared, WORKSPACE_ID, WALLET_ID, deps)).toEqual({
      ok: false,
      error: "unit_in_other_wallet",
    });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("recusa entrada inválida sem gravar", async () => {
    const deps = makeDeps();

    expect(await updateWallet({ ...shared, units: [] }, WORKSPACE_ID, WALLET_ID, deps)).toEqual({
      ok: false,
      error: "no_units",
    });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", WORKSPACE_ID, null],
    ["sem workspace", null, WALLET_ID],
  ])("carteira não encontrada %s", async (_label, workspaceId, walletId) => {
    const deps = makeDeps();

    expect(await updateWallet(shared, workspaceId, walletId, deps)).toEqual({ ok: false, error: "wallet_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("carteira não encontrada quando ela não existe no workspace", async () => {
    const deps = makeDeps();
    deps.update.mockResolvedValue(false);

    expect(await updateWallet(shared, WORKSPACE_ID, WALLET_ID, deps)).toEqual({
      ok: false,
      error: "wallet_not_found",
    });
  });
});

describe("deleteWallet", () => {
  it("exclui a carteira", async () => {
    const remove = vi.fn().mockResolvedValue(true);

    expect(await deleteWallet(WALLET_ID, remove)).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(WALLET_ID);
  });

  it("carteira não encontrada sem id ou quando ela não existe", async () => {
    expect(await deleteWallet(null, vi.fn())).toEqual({ ok: false, error: "wallet_not_found" });
    expect(await deleteWallet(WALLET_ID, vi.fn().mockResolvedValue(false))).toEqual({
      ok: false,
      error: "wallet_not_found",
    });
  });
});

// netByUnit: líquido real de cada unidade do dia do saldo inicial até hoje.
describe("walletBalance", () => {
  const opening = { amountCents: 100_000, date: "2026-09-01" };

  it("carteira compartilhada: saldo inicial mais o líquido de todas as unidades, sem saldo por unidade", () => {
    const wallet = {
      openingBalance: opening,
      units: [
        { unitId: UNIT_A, amountCents: null },
        { unitId: UNIT_B, amountCents: null },
      ],
    };

    expect(walletBalance(wallet, { [UNIT_A]: 5_000, [UNIT_B]: -2_000 })).toEqual({
      balanceCents: 103_000,
      undistributedCents: null,
      units: [
        { unitId: UNIT_A, balanceCents: null },
        { unitId: UNIT_B, balanceCents: null },
      ],
    });
  });

  it("carteira de uma unidade só: o saldo da unidade é o da carteira", () => {
    const wallet = { openingBalance: opening, units: [{ unitId: UNIT_A, amountCents: null }] };

    expect(walletBalance(wallet, { [UNIT_A]: 5_000 })).toEqual({
      balanceCents: 105_000,
      undistributedCents: null,
      units: [{ unitId: UNIT_A, balanceCents: 105_000 }],
    });
  });

  it("carteira distribuída: cada unidade tem a parte dela mais o próprio líquido, e a soma fecha com a carteira", () => {
    const wallet = {
      openingBalance: opening,
      units: [
        { unitId: UNIT_A, amountCents: 60_000 },
        { unitId: UNIT_B, amountCents: 40_000 },
      ],
    };

    expect(walletBalance(wallet, { [UNIT_A]: 5_000, [UNIT_B]: -50_000 })).toEqual({
      balanceCents: 55_000,
      undistributedCents: 0,
      units: [
        { unitId: UNIT_A, balanceCents: 65_000 },
        { unitId: UNIT_B, balanceCents: -10_000 },
      ],
    });
  });

  it("carteira distribuída em parte: o resto do saldo inicial fica não distribuído", () => {
    const wallet = {
      openingBalance: opening,
      units: [
        { unitId: UNIT_A, amountCents: 30_000 },
        { unitId: UNIT_B, amountCents: 0 },
      ],
    };

    expect(walletBalance(wallet, { [UNIT_A]: 1_000, [UNIT_B]: 2_000 })).toEqual({
      balanceCents: 103_000,
      undistributedCents: 70_000,
      units: [
        { unitId: UNIT_A, balanceCents: 31_000 },
        { unitId: UNIT_B, balanceCents: 2_000 },
      ],
    });
  });

  it("unidade sem líquido informado conta como zero", () => {
    const wallet = {
      openingBalance: opening,
      units: [
        { unitId: UNIT_A, amountCents: 60_000 },
        { unitId: UNIT_C, amountCents: 40_000 },
      ],
    };

    expect(walletBalance(wallet, { [UNIT_A]: 5_000 })).toEqual({
      balanceCents: 105_000,
      undistributedCents: 0,
      units: [
        { unitId: UNIT_A, balanceCents: 65_000 },
        { unitId: UNIT_C, balanceCents: 40_000 },
      ],
    });
  });

  it("carteira sem unidades (todas excluídas) fica só com o saldo inicial", () => {
    expect(walletBalance({ openingBalance: opening, units: [] }, {})).toEqual({
      balanceCents: 100_000,
      undistributedCents: null,
      units: [],
    });
  });
});
