import { describe, it, expect, vi } from "vitest";
import { criarCarteiraPropria } from "@/contextos/financeiro";
import { unidadeCriada } from "@/contextos/organizacao";

// Organização publica UnidadeCriada; o Financeiro reage criando a carteira própria da
// unidade (ADR-026), mesmo sem saldo inicial informado.

const EMPRESA_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIDADE_ID = "64b7f0c2a1b2c3d4e5f60720";
const AGORA = new Date("2026-10-17T13:00:00.000Z");

describe("unidadeCriada", () => {
  it("monta o evento UnidadeCriada com a unidade como agregado e o nome dela", () => {
    const evento = unidadeCriada(
      { empresaId: EMPRESA_ID, unidadeId: UNIDADE_ID, nome: "Spa Central" },
      { gerarId: () => "evento-1", agora: () => AGORA },
    );

    expect(evento).toEqual({
      id: "evento-1",
      tipo: "UnidadeCriada",
      versao: 1,
      ocorridoEm: AGORA,
      empresaId: EMPRESA_ID,
      agregadoId: UNIDADE_ID,
      dados: { unidadeId: UNIDADE_ID, nome: "Spa Central" },
    });
  });
});

describe("criarCarteiraPropria", () => {
  function makeDeps({ temCarteira = false } = {}) {
    return {
      // true quando a unidade já está em alguma carteira (evento repetido ou carteira criada antes).
      unidadeTemCarteira: vi.fn().mockResolvedValue(temCarteira),
      criarCarteira: vi.fn().mockResolvedValue(undefined),
    };
  }

  const evento = (nome: string, agora = AGORA) =>
    unidadeCriada({ empresaId: EMPRESA_ID, unidadeId: UNIDADE_ID, nome }, { gerarId: () => "evento-1", agora: () => agora });

  it("cria uma carteira só da unidade, com o nome dela e saldo inicial zero no dia da criação", async () => {
    const deps = makeDeps();

    await criarCarteiraPropria(evento("Spa Central"), deps);

    expect(deps.unidadeTemCarteira).toHaveBeenCalledWith(UNIDADE_ID);
    expect(deps.criarCarteira).toHaveBeenCalledWith({
      empresaId: EMPRESA_ID,
      nome: "Spa Central",
      saldoInicial: { valorCentavos: 0, dia: "2026-10-17" },
      unidadeId: UNIDADE_ID,
    });
  });

  it("o dia da criação é o de Brasília", async () => {
    const deps = makeDeps();

    // 01:30 de 17/10 em UTC ainda é 22:30 de 16/10 em Brasília.
    await criarCarteiraPropria(evento("Spa Central", new Date("2026-10-17T01:30:00.000Z")), deps);

    expect(deps.criarCarteira).toHaveBeenCalledWith(expect.objectContaining({ saldoInicial: { valorCentavos: 0, dia: "2026-10-16" } }));
  });

  it("nome de carteira com no máximo 40 caracteres", async () => {
    const deps = makeDeps();

    await criarCarteiraPropria(evento("Spa Central do Hotel Praia Grande — Ala Norte"), deps);

    expect(deps.criarCarteira).toHaveBeenCalledWith(expect.objectContaining({ nome: "Spa Central do Hotel Praia Grande — Ala " }));
  });

  it("unidade que já tem carteira não ganha outra (evento repetido)", async () => {
    const deps = makeDeps({ temCarteira: true });

    await criarCarteiraPropria(evento("Spa Central"), deps);

    expect(deps.criarCarteira).not.toHaveBeenCalled();
  });
});
