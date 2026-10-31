import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { parseOpeningBalance, type OpeningBalance, type OpeningBalanceError } from "@/service/workspace/[workspaceId]/cash-flow/opening-balance";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

export const MAX_WALLET_NAME_LENGTH = 40;

const walletSchema = z.object(
  {
    name: z
      .string({ error: "invalid_input" })
      .trim()
      .min(1, { error: "invalid_name" })
      .max(MAX_WALLET_NAME_LENGTH, { error: "name_too_long" }),
  },
  { error: "invalid_input" },
);

export type WalletInputError = "invalid_input" | "invalid_name" | "name_too_long";

export type CreateWalletError = AccessError | WalletInputError | OpeningBalanceError;

export type CreateWalletResult = { ok: true; walletId: string } | { ok: false; error: CreateWalletError };

export async function createWallet(
  input: unknown,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: {
    insert: (data: { workspaceId: string; name: string; openingBalance: OpeningBalance | null }) => Promise<{ id: string }>;
  },
): Promise<CreateWalletResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = walletSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<WalletInputError>(parsed.error) };
  const balance = parseOpeningBalance((input as Record<string, unknown>).openingBalance);
  if (!balance.ok) return balance;

  const wallet = await deps.insert({ workspaceId: ctx.workspaceId, name: parsed.data.name, openingBalance: balance.value });
  return { ok: true, walletId: wallet.id };
}

export type UpdateWalletError = AccessError | WalletInputError | "wallet_not_found";

export type UpdateWalletResult = { ok: true } | { ok: false; error: UpdateWalletError };

export async function updateWallet(
  input: unknown,
  walletId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { update: (walletId: string, data: { name: string }) => Promise<boolean> },
): Promise<UpdateWalletResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!walletId) return { ok: false, error: "wallet_not_found" };

  const parsed = walletSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<WalletInputError>(parsed.error) };

  if (!(await deps.update(walletId, parsed.data))) return { ok: false, error: "wallet_not_found" };
  return { ok: true };
}

export type DeleteWalletError = AccessError | "wallet_not_found" | "wallet_in_use" | "wallet_has_transactions";

export type DeleteWalletResult = { ok: true } | { ok: false; error: DeleteWalletError };

export async function deleteWallet(
  walletId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    hasUnits: (walletId: string) => Promise<boolean>;
    hasTransactions: (walletId: string) => Promise<boolean>;
    remove: (walletId: string) => Promise<boolean>;
  },
): Promise<DeleteWalletResult> {
  const accessError = checkAccess(ctx.actor, "cash_flow.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!walletId) return { ok: false, error: "wallet_not_found" };

  if (await deps.hasUnits(walletId)) return { ok: false, error: "wallet_in_use" };
  if (await deps.hasTransactions(walletId)) return { ok: false, error: "wallet_has_transactions" };

  if (!(await deps.remove(walletId))) return { ok: false, error: "wallet_not_found" };
  return { ok: true };
}
