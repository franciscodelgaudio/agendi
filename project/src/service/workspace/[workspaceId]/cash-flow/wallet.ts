import { isObjectIdOrHexString } from "mongoose";
import { parseOpeningBalance, type OpeningBalance, type OpeningBalanceError } from "@/service/workspace/[workspaceId]/cash-flow/opening-balance";
import { parsePriceCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/services/service";

const MAX_NAME_LENGTH = 40;

// Conta (banco ou dinheiro) de onde entra e sai o dinheiro de uma ou mais unidades.
// amountCents é a parte do saldo inicial que pertence à unidade; null em todas quando a
// carteira é compartilhada, sem divisão entre as unidades.
export type WalletUnit = { unitId: string; amountCents: number | null };

export type WalletData = { name: string; openingBalance: OpeningBalance; units: WalletUnit[] };

export type WalletInputError =
  | "invalid_name"
  | "name_too_long"
  | OpeningBalanceError
  | "no_units"
  | "invalid_units"
  | "invalid_unit_amount"
  | "distribution_exceeds_balance";

type WalletDeps = {
  // Confere se todas as unidades são do workspace.
  unitsExist: (workspaceId: string, unitIds: string[]) => Promise<boolean>;
  // Confere se alguma unidade já está em outra carteira; excludeId é a própria carteira na edição.
  unitsInOtherWallet: (unitIds: string[], excludeId: string | null) => Promise<boolean>;
};

// Valida e normaliza os campos como chegam do FormData. Só a carteira distribuída
// (distributed marcado) lê o valor de cada unidade; vazio vira zero.
function parseWalletInput(input: unknown): ({ ok: true } & WalletData) | { ok: false; error: WalletInputError } {
  const { name, openingBalance, distributed, units } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || !Array.isArray(units)) return { ok: false, error: "invalid_input" };

  const normalizedName = name.trim();
  if (!normalizedName) return { ok: false, error: "invalid_name" };
  if (normalizedName.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };

  const balance = parseOpeningBalance(openingBalance);
  if (!balance.ok) return balance;
  if (!balance.value) return { ok: false, error: "invalid_opening_balance" };

  if (units.length === 0) return { ok: false, error: "no_units" };
  const parsedUnits: WalletUnit[] = [];
  for (const unit of units) {
    const { unitId, amount } = (unit ?? {}) as Record<string, unknown>;
    if (typeof unitId !== "string" || (amount != null && typeof amount !== "string")) {
      return { ok: false, error: "invalid_input" };
    }
    if (!isObjectIdOrHexString(unitId)) return { ok: false, error: "invalid_units" };
    if (parsedUnits.some((parsed) => parsed.unitId === unitId)) return { ok: false, error: "invalid_input" };

    let amountCents: number | null = null;
    if (distributed) {
      const trimmed = amount?.trim();
      amountCents = trimmed ? parsePriceCents(trimmed) : 0;
      if (amountCents === null) return { ok: false, error: "invalid_unit_amount" };
    }
    parsedUnits.push({ unitId, amountCents });
  }

  const distributedCents = parsedUnits.reduce((sum, unit) => sum + (unit.amountCents ?? 0), 0);
  if (distributedCents > balance.value.amountCents) return { ok: false, error: "distribution_exceeds_balance" };

  return { ok: true, name: normalizedName, openingBalance: balance.value, units: parsedUnits };
}

// Uma unidade fica em uma carteira só, senão o líquido dela contaria duas vezes.
async function checkUnits(
  units: WalletUnit[],
  workspaceId: string,
  excludeId: string | null,
  deps: WalletDeps,
): Promise<"invalid_units" | "unit_in_other_wallet" | null> {
  const unitIds = units.map((unit) => unit.unitId);
  if (!(await deps.unitsExist(workspaceId, unitIds))) return "invalid_units";
  if (await deps.unitsInOtherWallet(unitIds, excludeId)) return "unit_in_other_wallet";
  return null;
}

export type CreateWalletError = WalletInputError | "unit_in_other_wallet" | "workspace_not_found";

export type CreateWalletResult = { ok: true; walletId: string } | { ok: false; error: CreateWalletError };

export async function createWallet(
  input: unknown,
  workspaceId: string | null | undefined,
  deps: WalletDeps & { insert: (data: WalletData & { workspaceId: string }) => Promise<{ id: string }> },
): Promise<CreateWalletResult> {
  if (!workspaceId) return { ok: false, error: "workspace_not_found" };

  const parsed = parseWalletInput(input);
  if (!parsed.ok) return parsed;
  const { name, openingBalance, units } = parsed;
  const unitsError = await checkUnits(units, workspaceId, null, deps);
  if (unitsError) return { ok: false, error: unitsError };

  const wallet = await deps.insert({ name, openingBalance, units, workspaceId });
  return { ok: true, walletId: wallet.id };
}

export type UpdateWalletError = WalletInputError | "unit_in_other_wallet" | "wallet_not_found";

export type UpdateWalletResult = { ok: true } | { ok: false; error: UpdateWalletError };

// update devolve false quando a carteira não existe (ou não é do workspace).
export async function updateWallet(
  input: unknown,
  workspaceId: string | null | undefined,
  walletId: string | null | undefined,
  deps: WalletDeps & { update: (walletId: string, data: WalletData) => Promise<boolean> },
): Promise<UpdateWalletResult> {
  if (!workspaceId || !walletId) return { ok: false, error: "wallet_not_found" };

  const parsed = parseWalletInput(input);
  if (!parsed.ok) return parsed;
  const { name, openingBalance, units } = parsed;
  const unitsError = await checkUnits(units, workspaceId, walletId, deps);
  if (unitsError) return { ok: false, error: unitsError };

  const found = await deps.update(walletId, { name, openingBalance, units });
  return found ? { ok: true } : { ok: false, error: "wallet_not_found" };
}

export type DeleteWalletResult = { ok: true } | { ok: false; error: "wallet_not_found" };

// remove devolve false quando a carteira não existe (ou não é do workspace).
export async function deleteWallet(
  walletId: string | null | undefined,
  remove: (walletId: string) => Promise<boolean>,
): Promise<DeleteWalletResult> {
  if (!walletId) return { ok: false, error: "wallet_not_found" };

  const found = await remove(walletId);
  return found ? { ok: true } : { ok: false, error: "wallet_not_found" };
}

export type WalletBalance = {
  balanceCents: number;
  // Parte do saldo inicial que não foi dada a nenhuma unidade; null sem distribuição.
  undistributedCents: number | null;
  // Saldo da unidade: a parte dela mais o próprio líquido na carteira distribuída, o da
  // carteira quando ela é a única unidade, e null na carteira compartilhada.
  units: { unitId: string; balanceCents: number | null }[];
};

// netByUnit: líquido real de cada unidade do dia do saldo inicial até hoje; sem ele, zero.
export function walletBalance(
  { openingBalance, units }: Pick<WalletData, "openingBalance" | "units">,
  netByUnit: Record<string, number>,
): WalletBalance {
  const netOf = (unitId: string) => netByUnit[unitId] ?? 0;
  const balanceCents = units.reduce((sum, unit) => sum + netOf(unit.unitId), openingBalance.amountCents);
  const distributed = units.some((unit) => unit.amountCents !== null);
  const sole = units.length === 1;

  return {
    balanceCents,
    undistributedCents: distributed
      ? units.reduce((rest, unit) => rest - (unit.amountCents ?? 0), openingBalance.amountCents)
      : null,
    units: units.map(({ unitId, amountCents }) => ({
      unitId,
      balanceCents: distributed ? (amountCents ?? 0) + netOf(unitId) : sole ? balanceCents : null,
    })),
  };
}
