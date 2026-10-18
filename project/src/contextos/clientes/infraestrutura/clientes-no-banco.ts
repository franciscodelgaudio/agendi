import { Types } from "mongoose";
import type { DadosDoCliente } from "../dominio/cliente";
import { Customer } from "./cliente-modelo";

function documento({ nome, cpf, telefones, email, observacoes }: DadosDoCliente) {
  return { name: nome, cpf, phones: telefones, email, notes: observacoes };
}

export const clientesNoBanco = {
  cpfEmUso: async ({ empresaId, cpf, exceto }: { empresaId: string; cpf: string; exceto?: string }) =>
    (await Customer.exists({
      workspaceId: new Types.ObjectId(empresaId),
      cpf,
      ...(exceto && { _id: { $ne: new Types.ObjectId(exceto) } }),
    })) !== null,

  inserir: async ({ empresaId, ...dados }: DadosDoCliente & { empresaId: string }) => {
    const cliente = await Customer.create({ ...documento(dados), workspaceId: new Types.ObjectId(empresaId) });
    return { id: cliente._id.toString() };
  },

  // Cliente de outra empresa não é encontrado.
  atualizarNaEmpresa: (empresaId: string) => async (clienteId: string, dados: DadosDoCliente) => {
    const { matchedCount } = await Customer.updateOne(
      { _id: clienteId, workspaceId: new Types.ObjectId(empresaId) },
      { $set: documento(dados) },
    );
    return matchedCount > 0;
  },
};

// Dois cadastros com o mesmo CPF ao mesmo tempo: o índice único recusa o segundo.
export function cpfDuplicadoNoBanco(erro: unknown) {
  return (erro as { code?: number } | null)?.code === 11000;
}
