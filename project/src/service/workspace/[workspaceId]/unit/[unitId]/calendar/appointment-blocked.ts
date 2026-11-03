import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { parseDurationMinutes } from "@/service/workspace/[workspaceId]/services/service";
import { parsePerformedAt } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/appointment";
import type { AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const MINUTE_MS = 60 * 1000;
const MAX_REASON_LENGTH = 120;

type FieldsError = "invalid_input" | "invalid_member" | "invalid_starts_at" | "invalid_duration" | "reason_too_long";

export type AppointmentBlockedFieldsError = FieldsError | "member_not_found" | "member_busy";

const fieldsSchema = z.object(
  {
    workspaceMemberId: z.string({ error: "invalid_input" }).trim().min(1, { error: "invalid_member" }),
    startsAt: z.string({ error: "invalid_input" }).transform((value, ctx) => {
      const parsed = parsePerformedAt(value.trim());
      if (!parsed) ctx.addIssue({ code: "custom", message: "invalid_starts_at" });
      return parsed ?? z.NEVER;
    }),
    durationMinutes: z.string({ error: "invalid_duration" }).transform((value, ctx) => {
      const parsed = parseDurationMinutes(value);
      if (parsed === null) ctx.addIssue({ code: "custom", message: "invalid_duration" });
      return parsed ?? z.NEVER;
    }),
    reason: z
      .string({ error: "invalid_input" })
      .trim()
      .max(MAX_REASON_LENGTH, { error: "reason_too_long" })
      .nullish()
      .transform((value) => value || null),
  },
  { error: "invalid_input" },
);

export type AppointmentBlockedFields = {
  workspaceMemberId: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  reason: string | null;
};

type Ctx = { actor: Actor | null; actorMemberId: string | null };

type Lookups = {
  findMember: (id: string) => Promise<{ id: string } | null>;
  hasAppointments: (interval: { workspaceMemberId: string; startsAt: Date; endsAt: Date; unitId: string | null }) => Promise<boolean>;
};

type Found = { workspaceMemberId: string; unitId: string | null };

function checkBlockAccess(actor: Actor | null): AccessError | null {
  if (!actor) return "workspace_not_found";
  return can(actor, "schedule.block_others") || can(actor, "attends") ? null : "forbidden";
}

function canBlock({ actor, actorMemberId }: Ctx, workspaceMemberId: string) {
  return can(actor, "schedule.block_others") || (can(actor, "attends") && workspaceMemberId === actorMemberId);
}

function parseFields(input: unknown): { ok: true; fields: AppointmentBlockedFields } | { ok: false; error: FieldsError } {
  const parsed = fieldsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<FieldsError>(parsed.error) };
  const { workspaceMemberId, startsAt, durationMinutes, reason } = parsed.data;
  const endsAt = new Date(startsAt.getTime() + durationMinutes * MINUTE_MS);
  return { ok: true, fields: { workspaceMemberId, startsAt, endsAt, durationMinutes, reason } };
}

async function checkMember(
  { workspaceMemberId, startsAt, endsAt }: AppointmentBlockedFields,
  unitId: string | null,
  { findMember, hasAppointments }: Lookups,
): Promise<AppointmentBlockedFieldsError | null> {
  if (!(await findMember(workspaceMemberId))) return "member_not_found";
  if (await hasAppointments({ workspaceMemberId, startsAt, endsAt, unitId })) return "member_busy";
  return null;
}

export type AppointmentBlockedData = AppointmentBlockedFields & { workspaceId: string; unitId: string | null };

export type CreateAppointmentBlockedResult =
  | { ok: true; appointmentBlockedId: string }
  | { ok: false; error: AccessError | AppointmentBlockedFieldsError };

export async function createAppointmentBlocked(
  input: unknown,
  ctx: Ctx & { workspaceId: string; unitId: string | null },
  { insert, ...lookups }: Lookups & { insert: (data: AppointmentBlockedData) => Promise<{ id: string }> },
): Promise<CreateAppointmentBlockedResult> {
  const accessError = checkBlockAccess(ctx.actor);
  if (accessError) return { ok: false, error: accessError };

  const parsed = parseFields(input);
  if (!parsed.ok) return parsed;
  if (!canBlock(ctx, parsed.fields.workspaceMemberId)) return { ok: false, error: "forbidden" };

  const unavailable = await checkMember(parsed.fields, ctx.unitId, lookups);
  if (unavailable) return { ok: false, error: unavailable };

  const blocked = await insert({ workspaceId: ctx.workspaceId, unitId: ctx.unitId, ...parsed.fields });
  return { ok: true, appointmentBlockedId: blocked.id };
}

export type AppointmentBlockedResult<E extends string> = { ok: true } | { ok: false; error: E };

export type UpdateAppointmentBlockedError = AccessError | AppointmentBlockedFieldsError | "appointment_blocked_not_found";

export async function updateAppointmentBlocked(
  input: unknown,
  appointmentBlockedId: string | null | undefined,
  ctx: Ctx,
  {
    findAppointmentBlocked,
    update,
    ...lookups
  }: Lookups & {
    findAppointmentBlocked: (id: string) => Promise<Found | null>;
    update: (id: string, fields: AppointmentBlockedFields) => Promise<boolean>;
  },
): Promise<AppointmentBlockedResult<UpdateAppointmentBlockedError>> {
  const accessError = checkBlockAccess(ctx.actor);
  if (accessError) return { ok: false, error: accessError };
  if (!appointmentBlockedId) return { ok: false, error: "appointment_blocked_not_found" };

  const parsed = parseFields(input);
  if (!parsed.ok) return parsed;

  const found = await findAppointmentBlocked(appointmentBlockedId);
  if (!found) return { ok: false, error: "appointment_blocked_not_found" };
  if (!canBlock(ctx, found.workspaceMemberId) || !canBlock(ctx, parsed.fields.workspaceMemberId)) {
    return { ok: false, error: "forbidden" };
  }

  const unavailable = await checkMember(parsed.fields, found.unitId, lookups);
  if (unavailable) return { ok: false, error: unavailable };

  if (!(await update(appointmentBlockedId, parsed.fields))) return { ok: false, error: "appointment_blocked_not_found" };
  return { ok: true };
}

export type DeleteAppointmentBlockedError = AccessError | "appointment_blocked_not_found";

export async function deleteAppointmentBlocked(
  appointmentBlockedId: string | null | undefined,
  ctx: Ctx,
  deps: {
    findAppointmentBlocked: (id: string) => Promise<Found | null>;
    remove: (id: string) => Promise<boolean>;
  },
): Promise<AppointmentBlockedResult<DeleteAppointmentBlockedError>> {
  const accessError = checkBlockAccess(ctx.actor);
  if (accessError) return { ok: false, error: accessError };
  if (!appointmentBlockedId) return { ok: false, error: "appointment_blocked_not_found" };

  const found = await deps.findAppointmentBlocked(appointmentBlockedId);
  if (!found) return { ok: false, error: "appointment_blocked_not_found" };
  if (!canBlock(ctx, found.workspaceMemberId)) return { ok: false, error: "forbidden" };

  if (!(await deps.remove(appointmentBlockedId))) return { ok: false, error: "appointment_blocked_not_found" };
  return { ok: true };
}
