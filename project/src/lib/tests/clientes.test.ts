import { describe, it, expect, vi } from "vitest";
import { atualizarCliente, cadastrarCliente, lerCliente, normalizarCpf, normalizarTelefone } from "@/contextos/clientes";

// Cliente recorrente (ADR-040): identificado pelo CPF, único na empresa; pode ter vários
// telefones. Observações não guardam dado de saúde (pendência CL1).

const EMPRESA_ID = "64b7f0c2a1b2c3d4e5f60718";
const CLIENTE_ID = "64b7f0c2a1b2c3d4e5f60790";
// CPFs válidos (dígitos verificadores corretos).
const CPF = "52998224725";
const OUTRO_CPF = "11144477735";

const entrada = {
  nome: "Maria Souza",
  cpf: "529.982.247-25",
  telefones: ["(11) 98765-4321"],
  email: "maria@exemplo.com",
  observacoes: "Prefere pressão leve.",
};

describe("normalizarCpf", () => {
  it.each([
    ["com pontuação", "529.982.247-25", CPF],
    ["só dígitos", "52998224725", CPF],
    ["com espaços nas pontas", "  111.444.777-35 ", OUTRO_CPF],
  ])("CPF válido %s vira só os 11 dígitos", (_label, texto, esperado) => {
    expect(normalizarCpf(texto)).toBe(esperado);
  });

  it.each([
    ["dígito verificador errado", "529.982.247-26"],
    ["todos os dígitos iguais", "111.111.111-11"],
    ["poucos dígitos", "5299822472"],
    ["dígitos demais", "529982247250"],
    ["letras", "529.982.247-2a"],
    ["vazio", ""],
  ])("CPF inválido (%s) vira null", (_label, texto) => {
    expect(normalizarCpf(texto)).toBeNull();
  });
});

describe("normalizarTelefone", () => {
  it.each([
    ["celular com DDD", "(11) 98765-4321", "11987654321"],
    ["fixo com DDD", "(11) 3456-7890", "1134567890"],
    ["com código do país", "+55 11 98765-4321", "5511987654321"],
  ])("%s vira só os dígitos", (_label, texto, esperado) => {
    expect(normalizarTelefone(texto)).toBe(esperado);
  });

  it.each([
    ["sem DDD", "98765-4321"],
    ["dígitos demais", "+55 11 98765-43210"],
    ["letras", "11 9876-ABCD"],
  ])("telefone inválido (%s) vira null", (_label, texto) => {
    expect(normalizarTelefone(texto)).toBeNull();
  });
});

describe("lerCliente", () => {
  it("normaliza nome, CPF, telefones, e-mail e observações", () => {
    expect(lerCliente(entrada)).toEqual({
      ok: true,
      dados: {
        nome: "Maria Souza",
        cpf: CPF,
        telefones: ["11987654321"],
        email: "maria@exemplo.com",
        observacoes: "Prefere pressão leve.",
      },
    });
  });

  it("e-mail e observações vazios viram null; telefones vazios são ignorados e repetidos aparecem uma vez", () => {
    const resultado = lerCliente({
      ...entrada,
      telefones: ["", "(11) 98765-4321", "11 98765 4321", "  "],
      email: "  ",
      observacoes: "",
    });

    expect(resultado).toEqual({
      ok: true,
      dados: { nome: "Maria Souza", cpf: CPF, telefones: ["11987654321"], email: null, observacoes: null },
    });
  });

  it("aceita cliente sem telefone e sem e-mail", () => {
    const resultado = lerCliente({ nome: "Maria Souza", cpf: CPF, telefones: [], email: null, observacoes: null });

    expect(resultado).toEqual({
      ok: true,
      dados: { nome: "Maria Souza", cpf: CPF, telefones: [], email: null, observacoes: null },
    });
  });

  it.each([
    ["entrada nula", null, "entrada_invalida"],
    ["nome não é texto", { ...entrada, nome: 1 }, "entrada_invalida"],
    ["telefones não é lista", { ...entrada, telefones: "11987654321" }, "entrada_invalida"],
    ["nome vazio", { ...entrada, nome: "   " }, "nome_invalido"],
    ["nome com mais de 80 caracteres", { ...entrada, nome: "a".repeat(81) }, "nome_longo"],
    ["CPF inválido", { ...entrada, cpf: "529.982.247-26" }, "cpf_invalido"],
    ["telefone inválido", { ...entrada, telefones: ["98765-4321"] }, "telefone_invalido"],
    [
      "mais de 5 telefones",
      { ...entrada, telefones: ["11900000001", "11900000002", "11900000003", "11900000004", "11900000005", "11900000006"] },
      "telefones_demais",
    ],
    ["e-mail inválido", { ...entrada, email: "maria@" }, "email_invalido"],
    ["observações com mais de 500 caracteres", { ...entrada, observacoes: "a".repeat(501) }, "observacoes_longas"],
  ])("recusa %s", (_label, input, erro) => {
    expect(lerCliente(input)).toEqual({ ok: false, erro });
  });
});

describe("cadastrarCliente", () => {
  function makeDeps({ emUso = false } = {}) {
    return {
      // true quando outro cliente da empresa já tem o CPF.
      cpfEmUso: vi.fn().mockResolvedValue(emUso),
      inserir: vi.fn().mockResolvedValue({ id: CLIENTE_ID }),
    };
  }

  it("cadastra o cliente na empresa com os dados normalizados", async () => {
    const deps = makeDeps();

    const resultado = await cadastrarCliente(entrada, EMPRESA_ID, deps);

    expect(resultado).toEqual({ ok: true, clienteId: CLIENTE_ID });
    expect(deps.cpfEmUso).toHaveBeenCalledWith({ empresaId: EMPRESA_ID, cpf: CPF });
    expect(deps.inserir).toHaveBeenCalledWith({
      empresaId: EMPRESA_ID,
      nome: "Maria Souza",
      cpf: CPF,
      telefones: ["11987654321"],
      email: "maria@exemplo.com",
      observacoes: "Prefere pressão leve.",
    });
  });

  it("CPF de outro cliente da empresa: cpf_em_uso, sem cadastrar", async () => {
    const deps = makeDeps({ emUso: true });

    const resultado = await cadastrarCliente(entrada, EMPRESA_ID, deps);

    expect(resultado).toEqual({ ok: false, erro: "cpf_em_uso" });
    expect(deps.inserir).not.toHaveBeenCalled();
  });

  it("dados inválidos: erro sem consultar nem cadastrar", async () => {
    const deps = makeDeps();

    const resultado = await cadastrarCliente({ ...entrada, cpf: "123" }, EMPRESA_ID, deps);

    expect(resultado).toEqual({ ok: false, erro: "cpf_invalido" });
    expect(deps.cpfEmUso).not.toHaveBeenCalled();
    expect(deps.inserir).not.toHaveBeenCalled();
  });
});

describe("atualizarCliente", () => {
  function makeDeps({ emUso = false, encontrado = true } = {}) {
    return {
      cpfEmUso: vi.fn().mockResolvedValue(emUso),
      // false quando o cliente não existe (ou não é da empresa).
      atualizar: vi.fn().mockResolvedValue(encontrado),
    };
  }

  it("atualiza o cliente, conferindo o CPF contra os outros clientes da empresa", async () => {
    const deps = makeDeps();

    const resultado = await atualizarCliente({ ...entrada, cpf: OUTRO_CPF }, { empresaId: EMPRESA_ID, clienteId: CLIENTE_ID }, deps);

    expect(resultado).toEqual({ ok: true });
    expect(deps.cpfEmUso).toHaveBeenCalledWith({ empresaId: EMPRESA_ID, cpf: OUTRO_CPF, exceto: CLIENTE_ID });
    expect(deps.atualizar).toHaveBeenCalledWith(CLIENTE_ID, {
      nome: "Maria Souza",
      cpf: OUTRO_CPF,
      telefones: ["11987654321"],
      email: "maria@exemplo.com",
      observacoes: "Prefere pressão leve.",
    });
  });

  it("CPF de outro cliente da empresa: cpf_em_uso, sem atualizar", async () => {
    const deps = makeDeps({ emUso: true });

    const resultado = await atualizarCliente(entrada, { empresaId: EMPRESA_ID, clienteId: CLIENTE_ID }, deps);

    expect(resultado).toEqual({ ok: false, erro: "cpf_em_uso" });
    expect(deps.atualizar).not.toHaveBeenCalled();
  });

  it("cliente que não existe (ou não é da empresa): cliente_nao_encontrado", async () => {
    const resultado = await atualizarCliente(
      entrada,
      { empresaId: EMPRESA_ID, clienteId: CLIENTE_ID },
      makeDeps({ encontrado: false }),
    );

    expect(resultado).toEqual({ ok: false, erro: "cliente_nao_encontrado" });
  });

  it.each([undefined, null, ""])("sem clienteId (%j): cliente_nao_encontrado sem consultar", async (clienteId) => {
    const deps = makeDeps();

    const resultado = await atualizarCliente(entrada, { empresaId: EMPRESA_ID, clienteId }, deps);

    expect(resultado).toEqual({ ok: false, erro: "cliente_nao_encontrado" });
    expect(deps.cpfEmUso).not.toHaveBeenCalled();
    expect(deps.atualizar).not.toHaveBeenCalled();
  });
});
