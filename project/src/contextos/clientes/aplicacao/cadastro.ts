import { lerCliente, type DadosDoCliente, type ErroDoCliente } from "../dominio/cliente";

export type ErroDoCadastro = ErroDoCliente | "cpf_em_uso" | "cliente_nao_encontrado";

// true quando outro cliente da empresa (fora `exceto`) já tem o CPF.
type CpfEmUso = (consulta: { empresaId: string; cpf: string; exceto?: string }) => Promise<boolean>;

export async function cadastrarCliente(
  entrada: unknown,
  empresaId: string,
  { cpfEmUso, inserir }: { cpfEmUso: CpfEmUso; inserir: (cliente: DadosDoCliente & { empresaId: string }) => Promise<{ id: string }> },
): Promise<{ ok: true; clienteId: string } | { ok: false; erro: ErroDoCadastro }> {
  const lido = lerCliente(entrada);
  if (!lido.ok) return lido;
  if (await cpfEmUso({ empresaId, cpf: lido.dados.cpf })) return { ok: false, erro: "cpf_em_uso" };

  const { id } = await inserir({ empresaId, ...lido.dados });
  return { ok: true, clienteId: id };
}

// atualizar devolve false quando o cliente não existe (ou não é da empresa).
export async function atualizarCliente(
  entrada: unknown,
  { empresaId, clienteId }: { empresaId: string; clienteId: string | null | undefined },
  { cpfEmUso, atualizar }: { cpfEmUso: CpfEmUso; atualizar: (clienteId: string, dados: DadosDoCliente) => Promise<boolean> },
): Promise<{ ok: true } | { ok: false; erro: ErroDoCadastro }> {
  if (!clienteId) return { ok: false, erro: "cliente_nao_encontrado" };

  const lido = lerCliente(entrada);
  if (!lido.ok) return lido;
  if (await cpfEmUso({ empresaId, cpf: lido.dados.cpf, exceto: clienteId })) return { ok: false, erro: "cpf_em_uso" };

  const encontrado = await atualizar(clienteId, lido.dados);
  return encontrado ? { ok: true } : { ok: false, erro: "cliente_nao_encontrado" };
}
