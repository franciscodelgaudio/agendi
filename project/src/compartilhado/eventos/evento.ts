// Envelope de todo evento de domínio publicado entre contextos (Published Language).
// id: único; o consumidor o usa para não processar o mesmo evento duas vezes.
// versao: versão do contrato de `dados`; muda quando o formato deixa de ser compatível.
export type EventoDeDominio<Tipo extends string = string, Dados = unknown> = {
  id: string;
  tipo: Tipo;
  versao: number;
  ocorridoEm: Date;
  empresaId: string;
  agregadoId: string;
  dados: Dados;
};

export type NovoEvento<Tipo extends string, Dados> = Omit<EventoDeDominio<Tipo, Dados>, "id" | "versao" | "ocorridoEm"> & {
  versao?: number;
};

// Para os testes fixarem o id e a hora; sem eles, um UUID e a hora atual.
export type OpcoesDoEvento = { gerarId?: () => string; agora?: () => Date };

export function criarEvento<Tipo extends string, Dados>(
  { tipo, versao = 1, empresaId, agregadoId, dados }: NovoEvento<Tipo, Dados>,
  { gerarId = () => crypto.randomUUID(), agora = () => new Date() }: OpcoesDoEvento = {},
): EventoDeDominio<Tipo, Dados> {
  return { id: gerarId(), tipo, versao, ocorridoEm: agora(), empresaId, agregadoId, dados };
}
