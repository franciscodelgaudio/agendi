// Só para o servidor (páginas e actions): lê o banco direto.
import { Types } from "mongoose";
import { escapeRegex } from "@/service/workspace/[workspaceId]/unit/unit-list";
import { Customer } from "./infraestrutura/cliente-modelo";

const TAMANHO_MAXIMO_DA_BUSCA = 80;

export type ClienteDaLista = {
  id: string;
  nome: string;
  cpf: string;
  telefones: string[];
  email: string | null;
  observacoes: string | null;
  criadoEm: Date;
};

// Clientes da empresa em ordem de nome. A busca casa o trecho do nome (sem diferenciar
// maiúsculas) ou, se tiver dígitos, o começo do CPF. O acesso à empresa é conferido por quem chama.
export async function listarClientes(empresaId: string, busca = ""): Promise<ClienteDaLista[]> {
  const termo = busca.trim().slice(0, TAMANHO_MAXIMO_DA_BUSCA);
  const digitos = termo.replace(/\D/g, "");
  const filtro = termo
    ? {
        $or: [
          { name: { $regex: escapeRegex(termo), $options: "i" } },
          ...(digitos ? [{ cpf: { $regex: `^${digitos}` } }] : []),
        ],
      }
    : {};
  const clientes = await Customer.find({ workspaceId: new Types.ObjectId(empresaId), ...filtro })
    .sort({ name: 1, _id: 1 })
    .lean();
  return clientes.map((cliente) => ({
    id: cliente._id.toString(),
    nome: cliente.name,
    cpf: cliente.cpf,
    telefones: cliente.phones,
    email: cliente.email ?? null,
    observacoes: cliente.notes ?? null,
    criadoEm: cliente.createdAt,
  }));
}

// Cliente da empresa pelo id, para o agendamento e o atendimento copiarem o nome; null se não
// existe nela.
export async function buscarClientePorId(empresaId: string, clienteId: string): Promise<{ id: string; nome: string } | null> {
  if (!Types.ObjectId.isValid(clienteId)) return null;
  const cliente = await Customer.findOne({ _id: clienteId, workspaceId: new Types.ObjectId(empresaId) })
    .select({ name: 1 })
    .lean();
  return cliente && { id: cliente._id.toString(), nome: cliente.name };
}

// Seletor de cliente recorrente nos formulários: poucos por vez, por trecho do nome ou começo do CPF.
export async function buscarClientesParaEscolha(empresaId: string, busca: string) {
  const clientes = await listarClientes(empresaId, busca);
  return clientes.slice(0, 20).map(({ id, nome, cpf }) => ({ id, nome, cpf }));
}
