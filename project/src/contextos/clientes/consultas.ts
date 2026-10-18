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
