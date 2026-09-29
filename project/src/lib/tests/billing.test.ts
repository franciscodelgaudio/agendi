import { describe, it, expect, vi } from "vitest";
import { handleAbacateEvent, hasActiveSubscription, startCheckout } from "@/lib/billing";

const USER_ID = "64b7f0c2a1b2c3d4e5f60720";
const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const CHECKOUT_ID = "64b7f0c2a1b2c3d4e5f60799";
const NEW_WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60777";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-28T12:00:00.000Z");

describe("startCheckout", () => {
  const ctx = { userId: USER_ID, email: "ana@exemplo.com", name: "Ana" };
  const makeDeps = () => ({
    ownsWorkspace: vi.fn().mockResolvedValue(true),
    insertCheckout: vi.fn().mockResolvedValue({ id: CHECKOUT_ID }),
    createCharge: vi.fn().mockResolvedValue({ chargeId: "bill_abc", url: "https://app.abacatepay.com/pay/bill_abc" }),
    attachCharge: vi.fn().mockResolvedValue(undefined),
  });

  it("registra a cobrança pendente com o valor do plano e devolve a URL do checkout", async () => {
    const deps = makeDeps();

    const result = await startCheckout({ plan: "starter" }, ctx, deps);

    expect(result).toEqual({ ok: true, url: "https://app.abacatepay.com/pay/bill_abc" });
    expect(deps.insertCheckout).toHaveBeenCalledWith({
      userId: USER_ID,
      workspaceId: null,
      planId: "starter",
      amount: 11900,
    });
    expect(deps.createCharge).toHaveBeenCalledWith({
      checkoutId: CHECKOUT_ID,
      planId: "starter",
      amount: 11900,
      email: "ana@exemplo.com",
      name: "Ana",
    });
    expect(deps.attachCharge).toHaveBeenCalledWith(CHECKOUT_ID, "bill_abc");
  });

  it.each([
    ["starter", 11900],
    ["growth", 17900],
    ["network", 27900],
  ])("cobra o valor da tabela (%s → %i)", async (plan, amount) => {
    const deps = makeDeps();

    await startCheckout({ plan }, ctx, deps);

    expect(deps.insertCheckout).toHaveBeenCalledWith(expect.objectContaining({ amount }));
  });

  it("vincula ao workspace informado quando o usuário é o dono", async () => {
    const deps = makeDeps();

    await startCheckout({ plan: "growth", workspaceId: WORKSPACE_ID }, ctx, deps);

    expect(deps.ownsWorkspace).toHaveBeenCalledWith(WORKSPACE_ID, USER_ID);
    expect(deps.insertCheckout).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WORKSPACE_ID }));
  });

  it("workspace de outro dono → workspace_not_found, sem cobrança", async () => {
    const deps = makeDeps();
    deps.ownsWorkspace.mockResolvedValue(false);

    const result = await startCheckout({ plan: "growth", workspaceId: WORKSPACE_ID }, ctx, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.insertCheckout).not.toHaveBeenCalled();
    expect(deps.createCharge).not.toHaveBeenCalled();
  });

  it("sem sessão → unauthenticated", async () => {
    const deps = makeDeps();

    const result = await startCheckout({ plan: "starter" }, { ...ctx, userId: null }, deps);

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(deps.insertCheckout).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "enterprise", 3])("plano inválido (%s) → invalid_plan", async (plan) => {
    const deps = makeDeps();

    const result = await startCheckout({ plan }, ctx, deps);

    expect(result).toEqual({ ok: false, error: "invalid_plan" });
    expect(deps.createCharge).not.toHaveBeenCalled();
  });

  it("input que não é objeto → invalid_plan", async () => {
    const result = await startCheckout(null, ctx, makeDeps());

    expect(result).toEqual({ ok: false, error: "invalid_plan" });
  });
});

describe("handleAbacateEvent", () => {
  const paidPayload = (overrides: Record<string, unknown> = {}) => ({
    id: "log_1",
    event: "checkout.completed",
    apiVersion: 2,
    devMode: false,
    data: {
      checkout: {
        id: "bill_abc",
        externalId: CHECKOUT_ID,
        amount: 11900,
        paidAmount: 11900,
        status: "PAID",
        ...overrides,
      },
      customer: { id: "cust_1", name: "Ana", email: "ana@exemplo.com" },
    },
  });

  const pendingCheckout = (overrides: Record<string, unknown> = {}) => ({
    id: CHECKOUT_ID,
    userId: USER_ID,
    workspaceId: null as string | null,
    planId: "starter" as const,
    amount: 11900,
    status: "pending" as const,
    ...overrides,
  });

  const makeDeps = () => ({
    findCheckout: vi.fn().mockResolvedValue(pendingCheckout()),
    markPaid: vi.fn().mockResolvedValue(true),
    markPending: vi.fn().mockResolvedValue(undefined),
    findWorkspace: vi.fn().mockResolvedValue(null),
    findOwnedWorkspace: vi.fn().mockResolvedValue(null),
    setSubscription: vi.fn().mockResolvedValue(undefined),
    createWorkspace: vi.fn().mockResolvedValue({ id: NEW_WORKSPACE_ID }),
  });

  const ctx = { now: NOW, acceptDevMode: false };

  const activeFor = (days: number, from = NOW) => ({
    planId: "starter",
    status: "active",
    paidAt: NOW,
    currentPeriodEnd: new Date(from.getTime() + days * DAY),
  });

  it("sem workspace: cria um com a assinatura ativa por 30 dias", async () => {
    const deps = makeDeps();

    const result = await handleAbacateEvent(paidPayload(), ctx, deps);

    expect(result).toBe("activated");
    expect(deps.findCheckout).toHaveBeenCalledWith(CHECKOUT_ID);
    expect(deps.markPaid).toHaveBeenCalledWith(CHECKOUT_ID, "bill_abc");
    expect(deps.createWorkspace).toHaveBeenCalledWith({
      name: "Meu negócio",
      userId: USER_ID,
      subscription: activeFor(30),
    });
    expect(deps.setSubscription).not.toHaveBeenCalled();
  });

  it("ativa o workspace mais antigo do usuário quando a cobrança não indica workspace", async () => {
    const deps = makeDeps();
    deps.findOwnedWorkspace.mockResolvedValue({ id: WORKSPACE_ID, subscription: null });

    const result = await handleAbacateEvent(paidPayload(), ctx, deps);

    expect(result).toBe("activated");
    expect(deps.findOwnedWorkspace).toHaveBeenCalledWith(USER_ID);
    expect(deps.setSubscription).toHaveBeenCalledWith(WORKSPACE_ID, activeFor(30));
    expect(deps.createWorkspace).not.toHaveBeenCalled();
  });

  it("ativa o workspace indicado na cobrança", async () => {
    const deps = makeDeps();
    deps.findCheckout.mockResolvedValue(pendingCheckout({ workspaceId: WORKSPACE_ID }));
    deps.findWorkspace.mockResolvedValue({ id: WORKSPACE_ID, subscription: null });

    await handleAbacateEvent(paidPayload(), ctx, deps);

    expect(deps.findWorkspace).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(deps.findOwnedWorkspace).not.toHaveBeenCalled();
    expect(deps.setSubscription).toHaveBeenCalledWith(WORKSPACE_ID, activeFor(30));
  });

  it("renovação antes do vencimento soma 30 dias ao fim do período atual", async () => {
    const deps = makeDeps();
    deps.findOwnedWorkspace.mockResolvedValue({ id: WORKSPACE_ID, subscription: activeFor(10) });

    await handleAbacateEvent(paidPayload(), ctx, deps);

    expect(deps.setSubscription).toHaveBeenCalledWith(WORKSPACE_ID, activeFor(40));
  });

  it("assinatura vencida conta os 30 dias a partir de agora", async () => {
    const deps = makeDeps();
    deps.findOwnedWorkspace.mockResolvedValue({ id: WORKSPACE_ID, subscription: activeFor(-5) });

    await handleAbacateEvent(paidPayload(), ctx, deps);

    expect(deps.setSubscription).toHaveBeenCalledWith(WORKSPACE_ID, activeFor(30));
  });

  it("troca de plano grava o plano da nova cobrança", async () => {
    const deps = makeDeps();
    deps.findCheckout.mockResolvedValue(pendingCheckout({ planId: "network", amount: 27900 }));
    deps.findOwnedWorkspace.mockResolvedValue({ id: WORKSPACE_ID, subscription: activeFor(10) });

    await handleAbacateEvent(paidPayload({ amount: 27900, paidAmount: 27900 }), ctx, deps);

    expect(deps.setSubscription).toHaveBeenCalledWith(
      WORKSPACE_ID,
      { ...activeFor(40), planId: "network" },
    );
  });

  it("cobrança já paga → duplicate, sem ativar de novo", async () => {
    const deps = makeDeps();
    deps.findCheckout.mockResolvedValue(pendingCheckout({ status: "paid" }));

    const result = await handleAbacateEvent(paidPayload(), ctx, deps);

    expect(result).toBe("duplicate");
    expect(deps.markPaid).not.toHaveBeenCalled();
    expect(deps.setSubscription).not.toHaveBeenCalled();
    expect(deps.createWorkspace).not.toHaveBeenCalled();
  });

  it("entrega simultânea que perde a marcação de pago → duplicate", async () => {
    const deps = makeDeps();
    deps.markPaid.mockResolvedValue(false);

    const result = await handleAbacateEvent(paidPayload(), ctx, deps);

    expect(result).toBe("duplicate");
    expect(deps.createWorkspace).not.toHaveBeenCalled();
  });

  it("valor pago menor que o da cobrança → amount_mismatch, sem ativar", async () => {
    const deps = makeDeps();

    const result = await handleAbacateEvent(paidPayload({ paidAmount: 100 }), ctx, deps);

    expect(result).toBe("amount_mismatch");
    expect(deps.markPaid).not.toHaveBeenCalled();
    expect(deps.createWorkspace).not.toHaveBeenCalled();
  });

  it("cobrança desconhecida → not_found", async () => {
    const deps = makeDeps();
    deps.findCheckout.mockResolvedValue(null);

    const result = await handleAbacateEvent(paidPayload(), ctx, deps);

    expect(result).toBe("not_found");
    expect(deps.markPaid).not.toHaveBeenCalled();
  });

  it("falha ao ativar devolve a cobrança para pendente e propaga o erro (a AbacatePay reenvia)", async () => {
    const deps = makeDeps();
    deps.createWorkspace.mockRejectedValue(new Error("db down"));

    await expect(handleAbacateEvent(paidPayload(), ctx, deps)).rejects.toThrow("db down");
    expect(deps.markPending).toHaveBeenCalledWith(CHECKOUT_ID);
  });

  it("evento de modo de teste é ignorado quando não aceito", async () => {
    const deps = makeDeps();

    const result = await handleAbacateEvent({ ...paidPayload(), devMode: true }, ctx, deps);

    expect(result).toBe("ignored");
    expect(deps.findCheckout).not.toHaveBeenCalled();
  });

  it("evento de modo de teste é processado quando aceito", async () => {
    const deps = makeDeps();

    const result = await handleAbacateEvent({ ...paidPayload(), devMode: true }, { ...ctx, acceptDevMode: true }, deps);

    expect(result).toBe("activated");
  });

  it.each([
    ["outro evento", { ...paidPayload(), event: "checkout.refunded" }],
    ["status diferente de PAID", paidPayload({ status: "PENDING" })],
    ["sem externalId", paidPayload({ externalId: undefined })],
    ["sem valor pago", paidPayload({ paidAmount: undefined })],
    ["sem data", { event: "checkout.completed" }],
    ["corpo inválido", null],
  ])("%s → ignored", async (_label, payload) => {
    const deps = makeDeps();

    const result = await handleAbacateEvent(payload, ctx, deps);

    expect(result).toBe("ignored");
    expect(deps.findCheckout).not.toHaveBeenCalled();
  });
});

describe("hasActiveSubscription", () => {
  it("ativa e dentro do período → true", () => {
    expect(hasActiveSubscription({ status: "active", currentPeriodEnd: new Date(NOW.getTime() + DAY) }, NOW)).toBe(true);
  });

  it("período vencido → false", () => {
    expect(hasActiveSubscription({ status: "active", currentPeriodEnd: new Date(NOW.getTime() - 1) }, NOW)).toBe(false);
  });

  it("sem assinatura → false", () => {
    expect(hasActiveSubscription(null, NOW)).toBe(false);
    expect(hasActiveSubscription(undefined, NOW)).toBe(false);
  });

  it("status diferente de active → false", () => {
    expect(hasActiveSubscription({ status: "cancelled", currentPeriodEnd: new Date(NOW.getTime() + DAY) }, NOW)).toBe(false);
  });
});
