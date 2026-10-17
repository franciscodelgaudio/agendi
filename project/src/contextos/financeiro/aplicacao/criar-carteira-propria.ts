import { diaEmBrasilia } from "@/compartilhado/tempo";
import type { UnidadeCriada } from "@/contextos/organizacao";

const TAMANHO_MAXIMO_DO_NOME = 40;

export type NovaCarteira = {
  empresaId: string;
  nome: string;
  saldoInicial: { valorCentavos: number; dia: string };
  unidadeId: string;
};

// ADR-026: toda unidade nova ganha uma carteira só dela, com o nome dela e saldo zero no dia
// da criação. Unidade que já está numa carteira (evento repetido) não ganha outra.
export async function criarCarteiraPropria(
  { empresaId, ocorridoEm, dados: { unidadeId, nome } }: UnidadeCriada,
  {
    unidadeTemCarteira,
    criarCarteira,
  }: {
    unidadeTemCarteira: (unidadeId: string) => Promise<boolean>;
    criarCarteira: (carteira: NovaCarteira) => Promise<void>;
  },
) {
  if (await unidadeTemCarteira(unidadeId)) return;

  await criarCarteira({
    empresaId,
    nome: nome.slice(0, TAMANHO_MAXIMO_DO_NOME),
    saldoInicial: { valorCentavos: 0, dia: diaEmBrasilia(ocorridoEm) },
    unidadeId,
  });
}
