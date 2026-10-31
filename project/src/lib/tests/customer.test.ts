import { describe, it, expect, vi } from "vitest";
import { createCustomer, deleteCustomer, updateCustomer } from "@/service/workspace/[workspaceId]/customers/customer";
import { ADMIN, STAFF, actorWith } from "@/lib/tests/actors";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const CUSTOMER_ID = "64b7f0c2a1b2c3d4e5f60740";

const MANAGER = actorWith("customers.manage");

const VALID = { name: "Maria Silva", observation: "Prefere horários pela manhã", cellphone: "(11) 98765-4321" };
const SAVED = { name: "Maria Silva", observation: "Prefere horários pela manhã", cellphone: "11987654321" };

describe("createCustomer", () => {
  function makeDeps() {
    return { insert: vi.fn().mockResolvedValue({ id: CUSTOMER_ID }) };
  }

  it("cria o cliente no workspace com o celular só em dígitos e retorna o id", async () => {
    const deps = makeDeps();

    const result = await createCustomer(VALID, { workspaceId: WORKSPACE_ID, actor: ADMIN }, deps);

    expect(result).toEqual({ ok: true, customerId: CUSTOMER_ID });
    expect(deps.insert).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID, ...SAVED });
  });

  it("quem gerencia clientes também cria", async () => {
    const deps = makeDeps();

    const result = await createCustomer(VALID, { workspaceId: WORKSPACE_ID, actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true, customerId: CUSTOMER_ID });
  });

  it("remove espaços das pontas do nome e da observação", async () => {
    const deps = makeDeps();

    await createCustomer(
      { name: "  Maria Silva  ", observation: "  Alergia a amêndoas  ", cellphone: "" },
      { workspaceId: WORKSPACE_ID, actor: ADMIN },
      deps,
    );

    expect(deps.insert).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      name: "Maria Silva",
      observation: "Alergia a amêndoas",
      cellphone: null,
    });
  });

  it.each([
    ["vazios", { observation: "", cellphone: "" }],
    ["só com espaços", { observation: "   ", cellphone: "   " }],
    ["ausentes (null)", { observation: null, cellphone: null }],
    ["não enviados", {}],
  ])("observação e celular %s ficam null", async (_label, optional) => {
    const deps = makeDeps();

    await createCustomer({ name: "Maria", ...optional }, { workspaceId: WORKSPACE_ID, actor: ADMIN }, deps);

    expect(deps.insert).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      name: "Maria",
      observation: null,
      cellphone: null,
    });
  });

  it.each([
    ["11987654321", "11987654321"],
    ["1133334444", "1133334444"],
    ["+55 (11) 98765-4321", "5511987654321"],
  ])("aceita o celular %s e salva %s", async (cellphone, digits) => {
    const deps = makeDeps();

    const result = await createCustomer({ name: "Maria", cellphone }, { workspaceId: WORKSPACE_ID, actor: ADMIN }, deps);

    expect(result.ok).toBe(true);
    expect(deps.insert).toHaveBeenCalledWith(expect.objectContaining({ cellphone: digits }));
  });

  it.each(["987654321", "55119876543210", "abc", "(11)"])("recusa o celular %s", async (cellphone) => {
    const deps = makeDeps();

    const result = await createCustomer({ name: "Maria", cellphone }, { workspaceId: WORKSPACE_ID, actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_cellphone" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it.each(["", "   "])("recusa o nome %j", async (name) => {
    const deps = makeDeps();

    const result = await createCustomer({ name }, { workspaceId: WORKSPACE_ID, actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_name" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("aceita nome com 120 caracteres e recusa com 121", async () => {
    const deps = makeDeps();
    const ctx = { workspaceId: WORKSPACE_ID, actor: ADMIN };

    expect((await createCustomer({ name: "a".repeat(120) }, ctx, deps)).ok).toBe(true);
    expect(await createCustomer({ name: "a".repeat(121) }, ctx, deps)).toEqual({ ok: false, error: "name_too_long" });
  });

  it("aceita observação com 1000 caracteres e recusa com 1001", async () => {
    const deps = makeDeps();
    const ctx = { workspaceId: WORKSPACE_ID, actor: ADMIN };

    expect((await createCustomer({ name: "Maria", observation: "a".repeat(1000) }, ctx, deps)).ok).toBe(true);
    expect(await createCustomer({ name: "Maria", observation: "a".repeat(1001) }, ctx, deps)).toEqual({
      ok: false,
      error: "observation_too_long",
    });
  });

  it.each([
    ["sem corpo", null],
    ["corpo que não é objeto", "Maria"],
    ["sem nome", { observation: "x" }],
    ["nome que não é texto", { name: 42 }],
    ["observação que não é texto", { name: "Maria", observation: 42 }],
    ["celular que não é texto", { name: "Maria", cellphone: 11987654321 }],
  ])("recusa entrada inválida: %s", async (_label, input) => {
    const deps = makeDeps();

    const result = await createCustomer(input, { workspaceId: WORKSPACE_ID, actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("sem acesso ao workspace, não cria", async () => {
    const deps = makeDeps();

    const result = await createCustomer(VALID, { workspaceId: WORKSPACE_ID, actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.insert).not.toHaveBeenCalled();
  });

  it("sem a permissão de gerenciar clientes, não cria", async () => {
    const deps = makeDeps();

    const result = await createCustomer(VALID, { workspaceId: WORKSPACE_ID, actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.insert).not.toHaveBeenCalled();
  });
});

describe("updateCustomer", () => {
  function makeDeps(found = true) {
    return { update: vi.fn().mockResolvedValue(found) };
  }

  it("salva os dados normalizados no cliente", async () => {
    const deps = makeDeps();

    const result = await updateCustomer(VALID, CUSTOMER_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.update).toHaveBeenCalledWith(CUSTOMER_ID, SAVED);
  });

  it("observação e celular vazios apagam os valores salvos", async () => {
    const deps = makeDeps();

    await updateCustomer({ name: "Maria", observation: "", cellphone: "" }, CUSTOMER_ID, { actor: ADMIN }, deps);

    expect(deps.update).toHaveBeenCalledWith(CUSTOMER_ID, { name: "Maria", observation: null, cellphone: null });
  });

  it("cliente que não existe no workspace", async () => {
    const deps = makeDeps(false);

    const result = await updateCustomer(VALID, CUSTOMER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "customer_not_found" });
  });

  it.each([null, undefined, ""])("sem id do cliente (%j), não atualiza", async (customerId) => {
    const deps = makeDeps();

    const result = await updateCustomer(VALID, customerId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "customer_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("valida a entrada como na criação", async () => {
    const deps = makeDeps();

    const result = await updateCustomer({ name: "Maria", cellphone: "123" }, CUSTOMER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "invalid_cellphone" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("sem acesso ao workspace, não atualiza", async () => {
    const deps = makeDeps();

    const result = await updateCustomer(VALID, CUSTOMER_ID, { actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.update).not.toHaveBeenCalled();
  });

  it("sem a permissão de gerenciar clientes, não atualiza", async () => {
    const deps = makeDeps();

    const result = await updateCustomer(VALID, CUSTOMER_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.update).not.toHaveBeenCalled();
  });
});

describe("deleteCustomer", () => {
  function makeDeps(found = true) {
    return { remove: vi.fn().mockResolvedValue(found) };
  }

  it("remove o cliente", async () => {
    const deps = makeDeps();

    const result = await deleteCustomer(CUSTOMER_ID, { actor: MANAGER }, deps);

    expect(result).toEqual({ ok: true });
    expect(deps.remove).toHaveBeenCalledWith(CUSTOMER_ID);
  });

  it("cliente que não existe no workspace", async () => {
    const deps = makeDeps(false);

    const result = await deleteCustomer(CUSTOMER_ID, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "customer_not_found" });
  });

  it.each([null, undefined, ""])("sem id do cliente (%j), não remove", async (customerId) => {
    const deps = makeDeps();

    const result = await deleteCustomer(customerId, { actor: ADMIN }, deps);

    expect(result).toEqual({ ok: false, error: "customer_not_found" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("sem acesso ao workspace, não remove", async () => {
    const deps = makeDeps();

    const result = await deleteCustomer(CUSTOMER_ID, { actor: null }, deps);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(deps.remove).not.toHaveBeenCalled();
  });

  it("sem a permissão de gerenciar clientes, não remove", async () => {
    const deps = makeDeps();

    const result = await deleteCustomer(CUSTOMER_ID, { actor: STAFF }, deps);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deps.remove).not.toHaveBeenCalled();
  });
});
