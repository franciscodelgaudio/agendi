import { criarEvento, type EventoDeDominio, type OpcoesDoEvento } from "@/compartilhado/eventos";

// Os outros contextos guardam só o id da unidade e uma cópia local do nome.
export type UnidadeCriada = EventoDeDominio<"UnidadeCriada", { unidadeId: string; nome: string }>;

export function unidadeCriada(
  { empresaId, unidadeId, nome }: { empresaId: string; unidadeId: string; nome: string },
  opcoes?: OpcoesDoEvento,
): UnidadeCriada {
  return criarEvento({ tipo: "UnidadeCriada", empresaId, agregadoId: unidadeId, dados: { unidadeId, nome } }, opcoes);
}
