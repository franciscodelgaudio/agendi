import { Types } from "mongoose";
import { openingBalanceRange, type OpeningBalance } from "@/service/workspace/[workspaceId]/cash-flow/opening-balance";
import type { RevenueShare } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share";
import { findTeamPayMembers, loadUnitNet } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store";
import { walletBalance } from "@/service/workspace/[workspaceId]/cash-flow/wallet";
import { Unit } from "@/models/Unit";
import { Wallet } from "@/models/Wallet";

export type WalletView = {
  id: string;
  name: string;
  openingBalance: OpeningBalance;
  balanceCents: number;
  undistributedCents: number | null;
  // amountCents: parte do saldo inicial; balanceCents: saldo da unidade (null na carteira compartilhada).
  units: { id: string; name: string; amountCents: number | null; balanceCents: number | null }[];
};

// Carteiras do workspace com o saldo de hoje, por nome; com unitId, só a carteira dela (lista
// vazia sem carteira). O acesso ao workspace é verificado por quem chama.
export async function loadWallets(workspaceId: string, today: string, unitId?: string): Promise<WalletView[]> {
  const workspace = new Types.ObjectId(workspaceId);
  const [wallets, units, team] = await Promise.all([
    Wallet.find({ workspaceId: workspace, ...(unitId && { "units.unitId": new Types.ObjectId(unitId) }) })
      .sort({ name: 1, _id: 1 })
      .lean(),
    Unit.find({ workspaceId: workspace }).select({ name: 1, revenueShare: 1 }).lean(),
    findTeamPayMembers(workspaceId),
  ]);
  const unitsById = new Map(
    units.map((unit) => [
      unit._id.toString(),
      { name: unit.name, revenueShare: (unit.revenueShare ?? null) as RevenueShare | null },
    ]),
  );

  return Promise.all(
    wallets.map(async (wallet) => {
      const openingBalance = { amountCents: wallet.openingBalance.amountCents, date: wallet.openingBalance.date };
      // Unidade excluída sai da carteira; por garantia, a que não existe mais é ignorada.
      const walletUnits = wallet.units
        .map((unit) => ({ unitId: unit.unitId.toString(), amountCents: unit.amountCents ?? null }))
        .filter((unit) => unitsById.has(unit.unitId));
      const range = openingBalanceRange(openingBalance, today);
      const nets = await Promise.all(
        walletUnits.map(({ unitId }) =>
          range ? loadUnitNet({ id: unitId, revenueShare: unitsById.get(unitId)!.revenueShare }, range, today, team) : 0,
        ),
      );
      const balance = walletBalance(
        { openingBalance, units: walletUnits },
        Object.fromEntries(walletUnits.map((unit, i) => [unit.unitId, nets[i]])),
      );
      return {
        id: wallet._id.toString(),
        name: wallet.name,
        openingBalance,
        balanceCents: balance.balanceCents,
        undistributedCents: balance.undistributedCents,
        units: walletUnits.map((unit, i) => ({
          id: unit.unitId,
          name: unitsById.get(unit.unitId)!.name,
          amountCents: unit.amountCents,
          balanceCents: balance.units[i].balanceCents,
        })),
      };
    }),
  );
}
