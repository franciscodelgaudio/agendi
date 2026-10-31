import { describe, it, expect, vi } from "vitest";
import {
  appointmentTransaction,
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const WALLET_ID = "64b7f0c2a1b2c3d4e5f60800";
const TRANSACTION_ID = "64b7f0c2a1b2c3d4e5f60810";

const MANAGER = actorWith("cash_flow.manage");

const VALID = { name: "Aluguel", total: "1500.00", type: "expense", paidAt: "2026-10-05" };
const SAVED = { name: "Aluguel", totalCents: 150_000, type: "expense", paidAt: new Date("2026-10-05T03:00:00.000Z") };

describe("createTransaction", () => {
  function makeDeps(walletExists = true) {
    return {
      walletExists: vi.fn().mockResolvedValue(walletExists),
      insert: vi.fn().mockResolvedValue({ id: TRANSACTION_ID }),
    };
  }
  const ctx = { workspaceId: WORKSPACE_ID, actor: ADMIN };

  it("lança a transação na carteira com o valor em centavos e o dia pago à meia-noite de Brasília", async () => {
    const deps = makeDeps();

    const result = await createTransaction(VALID, WALLET_ID, ctx, deps);

    expect(result).toEqual({ ok: true, transactionId: TRANSACTION_ID });
    expect(deps.walletExists).toHaveBeenCalledWith(WALLET_ID);
    expect(deps.insert).toHaveBeenCalledWith({ ...SAVED, walletId: WALLET_ID, workspaceId: WORKSPACE_ID });
  });

  it("entrada também é aceita, por quem gerencia o caixa", async () => {
    const deps = makeDeps();

    await createTransaction({ ...VALID, type: "incoming" }, WALLET_ID, { workspaceId: WORKSPACE_ID, actor: MANAGER }, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ type: "incoming" }));
  });

  it.each(["", "  ", null, undefined])("sem dia de pagamento (%j), fica pendente", async (paidAt) => {
    const deps = makeDeps();

    await createTransaction({ ...VALID, paidAt }, WALLET_ID, ctx, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ paidAt: null }));
  });

  it("remove espaços das pontas do nome", async () => {
    const deps = makeDeps();

    await createTransaction({ ...VALID, name: "  Aluguel  " }, WALLET_ID, ctx, deps);

    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ name: "Aluguel" }));
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome ausente", { ...VALID, name: undefined }, "invalid_input"],
    ["nome vazio", { ...VALID, name: " " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { ...VALID, name: "a".repeat(81) }, "name_too_long"],
    ["valor ausente", { ...VALID, total: undefined }, "invalid_input"],
    ["valor inválido", { ...VALID, total: "abc" }, "invalid_total"],
    ["valor zero", { ...VALID, total: "0" }, "invalid_total"],
    ["tipo desconhecido", { ...VALID, type: "transfer" }, "invalid_type"],
    ["dia inválido", { ...VALID, paidAt: "2026-02-30" }, "invalid_paid_at"],
  ])("recusa %s sem gravar", async (_label, input, error) => {
    const deps = makeDeps();

    const result = await createTransaction(input, WALLET_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("recusa carteira que não é do workspace", async () => {
    const deps = makeDeps(false);

    const result = await createTransaction(VALID, WALLET_ID, ctx, deps);

    expect(result).toEqual({ ok: false, error: "wallet_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each([null, undefined, ""])("sem carteira (%j), não grava", async (walletId) => {
    const deps = makeDeps();

    const result = await createTransaction(VALID, walletId, ctx, deps);

    expect(result).toEqual({ ok: false, error: "wallet_not_found" });
    expect(deps.walletExists).not.toHaveBeenCalled();
  });

  it.each([
    ["sem acesso ao workspace", null, "workspace_not_found"],
    ["sem a permissão de gerenciar o caixa", STAFF, "forbidden"],
  ] as const)("%s, não grava", async (_label, actor, error) => {
    const deps = makeDeps();

    const result = await createTransaction(VALID, WALLET_ID, { workspaceId: WORKSPACE_ID, actor }, deps);

    expect(result).toEqual({ ok: false, error });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateTransaction", () => {
  function makeDeps(found: { fromAppointment: boolean } | null = { fromAppointment: false }, updated = true) {
    return {
      findTransaction: vi.fn().mockResolvedValue(found),
      update: vi.fn().mockResolvedValue(updated),
    };
  }

  it("grava os dados normalizados", async () => {
    const deps = makeDeps();

    const result = await updateTransaction({ ...VALID, paidAt: "" }, TRANSACTION_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(TRANSACTION_ID, { ...SAVED, paidAt: null });
  });

  it("não edita a entrada gerada por um atendimento", async () => {
    const deps = makeDeps({ fromAppointment: true });

    const result = await updateTransaction(VALID, TRANSACTION_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "transaction_from_appointment" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("valida como no lançamento", async () => {
    const deps = makeDeps();

    const result = await updateTransaction({ ...VALID, total: "-5" }, TRANSACTION_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_total" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", null, makeDeps()],
    ["transação que não é do workspace", TRANSACTION_ID, makeDeps(null)],
    ["transação que some antes de gravar", TRANSACTION_ID, makeDeps({ fromAppointment: false }, false)],
  ])("%s devolve não encontrada", async (_label, transactionId, deps) => {
    const result = await updateTransaction(VALID, transactionId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "transaction_not_found" });
  });

  it("sem a permissão de gerenciar o caixa, não edita", async () => {
    const deps = makeDeps();

    const result = await updateTransaction(VALID, TRANSACTION_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("deleteTransaction", () => {
  function makeDeps(found: { fromAppointment: boolean } | null = { fromAppointment: false }, removed = true) {
    return {
      findTransaction: vi.fn().mockResolvedValue(found),
      remove: vi.fn().mockResolvedValue(removed),
    };
  }

  it("exclui a transação", async () => {
    const deps = makeDeps();

    const result = await deleteTransaction(TRANSACTION_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(TRANSACTION_ID);
  });

  it("não exclui a entrada gerada por um atendimento", async () => {
    const deps = makeDeps({ fromAppointment: true });

    const result = await deleteTransaction(TRANSACTION_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "transaction_from_appointment" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it.each([
    ["sem id", "", makeDeps()],
    ["transação que não é do workspace", TRANSACTION_ID, makeDeps(null)],
    ["transação que some antes de excluir", TRANSACTION_ID, makeDeps({ fromAppointment: false }, false)],
  ])("%s devolve não encontrada", async (_label, transactionId, deps) => {
    const result = await deleteTransaction(transactionId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "transaction_not_found" });
  });

  it("sem acesso ao workspace, não exclui", async () => {
    const deps = makeDeps();

    const result = await deleteTransaction(TRANSACTION_ID, { actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});

describe("appointmentTransaction", () => {
  const performedAt = new Date("2026-10-05T17:30:00.000Z");

  it("o atendimento vira uma entrada paga no horário dele, com a soma dos serviços cobrados", () => {
    expect(
      appointmentTransaction({
        guest: { name: "João Silva" },
        items: [{ priceCents: 18_000 }, { priceCents: 7_000 }],
        performedAt,
      }),
    ).toEqual({ name: "Atendimento · João Silva", totalCents: 25_000, type: "incoming", paidAt: performedAt });
  });

  it("atendimento sem valor cobrado não gera entrada", () => {
    expect(appointmentTransaction({ guest: { name: "João" }, items: [{ priceCents: 0 }], performedAt })).toBeNull();
  });
});
