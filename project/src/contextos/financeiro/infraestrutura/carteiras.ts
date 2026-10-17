import { Types } from "mongoose";
import { Wallet } from "@/models/Wallet";
import type { NovaCarteira } from "../aplicacao/criar-carteira-propria";

// Carteiras na coleção wallets do sistema atual, enquanto o Financeiro não tem a própria.
export const carteirasNoBanco = {
  unidadeTemCarteira: async (unidadeId: string) =>
    (await Wallet.exists({ "units.unitId": new Types.ObjectId(unidadeId) })) !== null,

  criarCarteira: async ({ empresaId, nome, saldoInicial, unidadeId }: NovaCarteira) => {
    await Wallet.create({
      name: nome,
      openingBalance: { amountCents: saldoInicial.valorCentavos, date: saldoInicial.dia },
      units: [{ unitId: new Types.ObjectId(unidadeId), amountCents: null }],
      workspaceId: new Types.ObjectId(empresaId),
    });
  },
};
