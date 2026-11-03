import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { parseMoneyCents } from "@/service/_shared/money";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

export const THRESHOLD_RULES = ["above", "from"] as const;
export const MAX_PARTNER_NAME_LENGTH = 60;
export const MAX_PARTNER_TIERS = 10;

const FULL_BPS = 10_000;
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const MONGO_DUPLICATE_KEY = 11000;

export type ThresholdRule = (typeof THRESHOLD_RULES)[number];

export type PartnerTier = { thresholdCents: number; shareBps: number };

type TieredPartner = { thresholdRule: ThresholdRule; tiers: PartnerTier[] };

export function appliedTierIndex(partner: TieredPartner, grossCents: number) {
  return partner.tiers.findLastIndex(
    (tier, index) =>
      index === 0 || (partner.thresholdRule === "above" ? grossCents > tier.thresholdCents : grossCents >= tier.thresholdCents),
  );
}

export function appliedShareBps(partner: TieredPartner, grossCents: number) {
  return partner.tiers[appliedTierIndex(partner, grossCents)].shareBps;
}

function parseShareBps(value: string) {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const bps = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return bps < FULL_BPS ? bps : null;
}

const tierSchema = z.object(
  {
    threshold: z
      .string({ error: "invalid_tier_threshold" })
      .transform((value) => parseMoneyCents(value) ?? -1)
      .refine((cents) => cents >= 0, { error: "invalid_tier_threshold" }),
    share: z
      .string({ error: "invalid_tier_share" })
      .transform((value) => parseShareBps(value) ?? -1)
      .refine((bps) => bps >= 0, { error: "invalid_tier_share" }),
  },
  { error: "invalid_tiers" },
);

const partnerSchema = z.object(
  {
    name: z
      .string({ error: "invalid_input" })
      .trim()
      .min(1, { error: "invalid_name" })
      .max(MAX_PARTNER_NAME_LENGTH, { error: "name_too_long" }),
    thresholdRule: z.enum(THRESHOLD_RULES, { error: "invalid_threshold_rule" }),
    tiers: z
      .array(tierSchema, { error: "invalid_tiers" })
      .min(1, { error: "invalid_tiers" })
      .max(MAX_PARTNER_TIERS, { error: "invalid_tiers" })
      .transform((tiers) => tiers.map((tier) => ({ thresholdCents: tier.threshold, shareBps: tier.share })))
      .refine((tiers) => tiers[0].thresholdCents === 0, { error: "first_tier_not_zero" })
      .refine((tiers) => tiers.every((tier, index) => index === 0 || tier.thresholdCents > tiers[index - 1].thresholdCents), {
        error: "tiers_not_increasing",
      }),
    unitId: z.string({ error: "invalid_input" }).nullish().transform((value) => value || null),
  },
  { error: "invalid_input" },
);

export type PartnerInputError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "invalid_threshold_rule"
  | "invalid_tiers"
  | "invalid_tier_threshold"
  | "invalid_tier_share"
  | "first_tier_not_zero"
  | "tiers_not_increasing";

export type PartnerData = { name: string; thresholdRule: ThresholdRule; tiers: PartnerTier[]; unitId: string | null };

type PartnerSaveError = PartnerInputError | "unit_not_found" | "unit_has_partner";

async function parsePartner(
  input: unknown,
  unitExists: (unitId: string) => Promise<boolean>,
): Promise<{ ok: true; data: PartnerData } | { ok: false; error: PartnerSaveError }> {
  const parsed = partnerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<PartnerInputError>(parsed.error) };
  const { unitId } = parsed.data;
  if (unitId && (!OBJECT_ID.test(unitId) || !(await unitExists(unitId)))) return { ok: false, error: "unit_not_found" };
  return { ok: true, data: parsed.data };
}

async function unlessUnitTaken<T>(save: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: "unit_has_partner" }> {
  try {
    return { ok: true, value: await save() };
  } catch (e) {
    if ((e as { code?: unknown })?.code === MONGO_DUPLICATE_KEY) return { ok: false, error: "unit_has_partner" };
    throw e;
  }
}

export type CreatePartnerError = AccessError | PartnerSaveError;

export type CreatePartnerResult = { ok: true; partnerId: string } | { ok: false; error: CreatePartnerError };

export async function createPartner(
  input: unknown,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: {
    unitExists: (unitId: string) => Promise<boolean>;
    insert: (data: PartnerData & { workspaceId: string }) => Promise<{ id: string }>;
  },
): Promise<CreatePartnerResult> {
  const accessError = checkAccess(ctx.actor, "partners.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = await parsePartner(input, deps.unitExists);
  if (!parsed.ok) return parsed;

  const saved = await unlessUnitTaken(() => deps.insert({ workspaceId: ctx.workspaceId, ...parsed.data }));
  if (!saved.ok) return saved;
  return { ok: true, partnerId: saved.value.id };
}

export type UpdatePartnerError = AccessError | PartnerSaveError | "partner_not_found";

export type UpdatePartnerResult = { ok: true } | { ok: false; error: UpdatePartnerError };

export async function updatePartner(
  input: unknown,
  partnerId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    unitExists: (unitId: string) => Promise<boolean>;
    update: (partnerId: string, data: PartnerData) => Promise<boolean>;
  },
): Promise<UpdatePartnerResult> {
  const accessError = checkAccess(ctx.actor, "partners.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!partnerId) return { ok: false, error: "partner_not_found" };

  const parsed = await parsePartner(input, deps.unitExists);
  if (!parsed.ok) return parsed;

  const saved = await unlessUnitTaken(() => deps.update(partnerId, parsed.data));
  if (!saved.ok) return saved;
  if (!saved.value) return { ok: false, error: "partner_not_found" };
  return { ok: true };
}

export type DeletePartnerError = AccessError | "partner_not_found" | "partner_has_statements";

export type DeletePartnerResult = { ok: true } | { ok: false; error: DeletePartnerError };

export async function deletePartner(
  partnerId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: {
    hasStatements: (partnerId: string) => Promise<boolean>;
    remove: (partnerId: string) => Promise<boolean>;
  },
): Promise<DeletePartnerResult> {
  const accessError = checkAccess(ctx.actor, "partners.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!partnerId) return { ok: false, error: "partner_not_found" };

  if (await deps.hasStatements(partnerId)) return { ok: false, error: "partner_has_statements" };

  if (!(await deps.remove(partnerId))) return { ok: false, error: "partner_not_found" };
  return { ok: true };
}
