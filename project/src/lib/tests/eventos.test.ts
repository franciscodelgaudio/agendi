import { describe, it, expect, vi } from "vitest";
import { criarEvento, criarPublicador } from "@/compartilhado/eventos";

// Envelope dos eventos de domínio e publicação síncrona, no mesmo processo, para os
// consumidores de outros contextos.

const EMPRESA_ID = "64b7f0c2a1b2c3d4e5f60718";
const UNIDADE_ID = "64b7f0c2a1b2c3d4e5f60720";
const AGORA = new Date("2026-10-17T13:00:00.000Z");
const FIXO = { gerarId: () => "evento-1", agora: () => AGORA };

const BASE = { tipo: "UnidadeCriada", empresaId: EMPRESA_ID, agregadoId: UNIDADE_ID, dados: { nome: "Spa Central" } };

describe("criarEvento", () => {
  it("monta o envelope com id, versão 1 e a hora em que ocorreu", () => {
    expect(criarEvento(BASE, FIXO)).toEqual({
      id: "evento-1",
      tipo: "UnidadeCriada",
      versao: 1,
      ocorridoEm: AGORA,
      empresaId: EMPRESA_ID,
      agregadoId: UNIDADE_ID,
      dados: { nome: "Spa Central" },
    });
  });

  it("aceita outra versão do contrato", () => {
    expect(criarEvento({ ...BASE, versao: 2 }, FIXO).versao).toBe(2);
  });

  it("sem gerador nem relógio, usa um id único (UUID) e a hora atual", () => {
    const antes = Date.now();

    const a = criarEvento(BASE);
    const b = criarEvento(BASE);

    expect(a.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(a.id).not.toBe(b.id);
    expect(a.ocorridoEm.getTime()).toBeGreaterThanOrEqual(antes);
    expect(a.ocorridoEm.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

describe("criarPublicador", () => {
  const evento = (tipo = "UnidadeCriada") => criarEvento({ ...BASE, tipo }, FIXO);

  it("entrega o evento a cada consumidor do tipo, um de cada vez, na ordem em que assinaram", async () => {
    const ordem: string[] = [];
    const publicador = criarPublicador({ aoFalhar: vi.fn() });
    publicador.assinar("UnidadeCriada", "financeiro", async () => {
      await Promise.resolve();
      ordem.push("financeiro");
    });
    publicador.assinar("UnidadeCriada", "estoque", async () => {
      ordem.push("estoque");
    });

    await publicador.publicar(evento());

    expect(ordem).toEqual(["financeiro", "estoque"]);
  });

  it("o consumidor recebe o próprio evento", async () => {
    const consumidor = vi.fn().mockResolvedValue(undefined);
    const publicador = criarPublicador({ aoFalhar: vi.fn() });
    publicador.assinar("UnidadeCriada", "financeiro", consumidor);

    const publicado = evento();
    await publicador.publicar(publicado);

    expect(consumidor).toHaveBeenCalledWith(publicado);
  });

  it("não entrega a consumidores de outro tipo", async () => {
    const consumidor = vi.fn().mockResolvedValue(undefined);
    const publicador = criarPublicador({ aoFalhar: vi.fn() });
    publicador.assinar("UnidadeDesativada", "financeiro", consumidor);

    await publicador.publicar(evento("UnidadeCriada"));

    expect(consumidor).not.toHaveBeenCalled();
  });

  it("sem consumidores, publicar termina sem erro", async () => {
    const aoFalhar = vi.fn();

    await expect(criarPublicador({ aoFalhar }).publicar(evento())).resolves.toBeUndefined();
    expect(aoFalhar).not.toHaveBeenCalled();
  });

  // A escrita de quem publicou já aconteceu: a falha de um consumidor não desfaz nada nem
  // impede os outros.
  it("consumidor que falha não impede os demais; a falha é reportada e publicar não lança", async () => {
    const erro = new Error("banco fora do ar");
    const aoFalhar = vi.fn();
    const depois = vi.fn().mockResolvedValue(undefined);
    const publicador = criarPublicador({ aoFalhar });
    publicador.assinar("UnidadeCriada", "financeiro", vi.fn().mockRejectedValue(erro));
    publicador.assinar("UnidadeCriada", "estoque", depois);

    const publicado = evento();
    await expect(publicador.publicar(publicado)).resolves.toBeUndefined();

    expect(depois).toHaveBeenCalledWith(publicado);
    expect(aoFalhar).toHaveBeenCalledTimes(1);
    expect(aoFalhar).toHaveBeenCalledWith({ consumidor: "financeiro", evento: publicado, erro });
  });

  it("o mesmo consumidor não assina duas vezes o mesmo tipo (receberia o evento em dobro)", () => {
    const publicador = criarPublicador({ aoFalhar: vi.fn() });
    publicador.assinar("UnidadeCriada", "financeiro", vi.fn());

    expect(() => publicador.assinar("UnidadeCriada", "financeiro", vi.fn())).toThrow(
      'O consumidor "financeiro" já assina "UnidadeCriada".',
    );
  });

  it("o mesmo consumidor pode assinar tipos diferentes", () => {
    const publicador = criarPublicador({ aoFalhar: vi.fn() });
    publicador.assinar("UnidadeCriada", "financeiro", vi.fn());

    expect(() => publicador.assinar("UnidadeDesativada", "financeiro", vi.fn())).not.toThrow();
  });
});
