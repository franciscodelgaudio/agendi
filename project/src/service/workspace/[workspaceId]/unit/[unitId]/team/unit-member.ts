import { parseDay } from "@/service/_shared/timezone";
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";
import { parsePercent } from "@/service/workspace/[workspaceId]/unit/[unitId]/revenue-share";
import { parsePriceCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/services/service";

// Remuneração de quem trabalha na unidade: comissão (%), salário mensal e bônus fixos
// mensais, combináveis e todos opcionais.
// Salário e bônus contam no caixa a partir da data de início; sem ela, contam sempre.

export const MAX_BONUS_DESCRIPTION_LENGTH = 80;

export type UpdateUnitMemberPayError =
  | "workspace_not_found"
  | "forbidden"
  | "member_not_found"
  | "invalid_input"
  | "invalid_commission"
  | "invalid_commission_base"
  | "invalid_salary"
  | "invalid_bonus"
  | "invalid_start_date"
  | "invalid_pay_day";

export type UpdateUnitMemberPayResult = { ok: true } | { ok: false; error: UpdateUnitMemberPayError };

export type UnitMemberBonus = { description: string; amountCents: number };
// Sobre os serviços que a pessoa fez ou sobre o faturamento bruto da unidade.
export const COMMISSION_BASES = ["services", "gross"] as const;
export type CommissionBase = (typeof COMMISSION_BASES)[number];
export type UnitMemberPay = {
  startDate: string | null;
  // Dia do mês em que o mês anterior é pago, de 1 a 31.
  payDay: number | null;
  // null sem comissão.
  commissionBase: CommissionBase | null;
  commissionPercent: number | null;
  salaryCents: number | null;
  bonuses: UnitMemberBonus[];
};

type UpdateUnitMemberPayDeps = {
  // null quando o membro não existe, não é do workspace ou não está vinculado à unidade.
  findMember: (memberId: string) => Promise<{ id: string } | null>;
  update: (memberId: string, data: UnitMemberPay) => Promise<void>;
};

// Campo ausente ou vazio vale null; undefined quando preenchido mas inválido.
function parseOptional(value: unknown, parser: (value: string) => number | null) {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "string") return undefined;
  return parser(value.trim()) ?? undefined;
}

function parseBonus(value: unknown): UnitMemberBonus | null {
  if (value == null || typeof value !== "object") return null;
  const { description, amount } = value as Record<string, unknown>;
  if (typeof description !== "string" || typeof amount !== "string") return null;
  const trimmed = description.trim();
  const amountCents = parsePriceCents(amount.trim());
  if (!trimmed || trimmed.length > MAX_BONUS_DESCRIPTION_LENGTH || !amountCents) return null;
  return { description: trimmed, amountCents };
}

export async function updateUnitMemberPay(
  input: unknown,
  memberId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: UpdateUnitMemberPayDeps,
): Promise<UpdateUnitMemberPayResult> {
  if (!ctx.actor) return { ok: false, error: "workspace_not_found" };
  if (!can(ctx.actor, "team.manage")) return { ok: false, error: "forbidden" };
  if (!memberId) return { ok: false, error: "member_not_found" };

  if (input == null || typeof input !== "object") return { ok: false, error: "invalid_input" };
  const { startDate, payDay, commissionBase, commissionPercent, salary, bonuses = [] } = input as Record<string, unknown>;
  if (!Array.isArray(bonuses)) return { ok: false, error: "invalid_input" };

  const member = await deps.findMember(memberId);
  if (!member) return { ok: false, error: "member_not_found" };

  const start = typeof startDate === "string" ? startDate.trim() || null : startDate;
  if (start != null && (typeof start !== "string" || !parseDay(start))) return { ok: false, error: "invalid_start_date" };
  const day = parseOptional(payDay, (value) => (/^\d{1,2}$/.test(value) && +value >= 1 && +value <= 31 ? +value : null));
  if (day === undefined) return { ok: false, error: "invalid_pay_day" };
  const percent = parseOptional(commissionPercent, parsePercent);
  if (percent === undefined) return { ok: false, error: "invalid_commission" };
  const base = COMMISSION_BASES.find((value) => value === commissionBase) ?? null;
  if (percent !== null && !base) return { ok: false, error: "invalid_commission_base" };
  const salaryCents = parseOptional(salary, (value) => parsePriceCents(value) || null);
  if (salaryCents === undefined) return { ok: false, error: "invalid_salary" };
  const parsedBonuses = bonuses.map(parseBonus);
  if (parsedBonuses.some((bonus) => !bonus)) return { ok: false, error: "invalid_bonus" };

  await deps.update(memberId, {
    startDate: (start as string | undefined) ?? null,
    payDay: day,
    commissionBase: percent === null ? null : base,
    commissionPercent: percent,
    salaryCents,
    bonuses: parsedBonuses as UnitMemberBonus[],
  });
  return { ok: true };
}
