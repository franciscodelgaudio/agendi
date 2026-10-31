import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { parseMoneyCents } from "@/service/_shared/money";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const MAX_NAME_LENGTH = 80;
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 12 * 60;

export function parseDurationMinutes(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number(trimmed);
  return minutes >= MIN_DURATION_MINUTES && minutes <= MAX_DURATION_MINUTES ? minutes : null;
}

const serviceSchema = z.object(
  {
    name: z
      .string({ error: "invalid_input" })
      .trim()
      .min(1, { error: "invalid_name" })
      .max(MAX_NAME_LENGTH, { error: "name_too_long" }),
    duration: z
      .string({ error: "invalid_input" })
      .transform(parseDurationMinutes)
      .refine((minutes) => minutes !== null, { error: "invalid_duration" }),
    price: z
      .string({ error: "invalid_input" })
      .transform(parseMoneyCents)
      .refine((cents) => cents !== null, { error: "invalid_price" }),
  },
  { error: "invalid_input" },
);

export type ServiceInputError = "invalid_input" | "invalid_name" | "name_too_long" | "invalid_duration" | "invalid_price";

export type ServiceData = { name: string; durationMinutes: number; priceCents: number };

function parseService(input: unknown): { ok: true; data: ServiceData } | { ok: false; error: ServiceInputError } {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<ServiceInputError>(parsed.error) };
  return { ok: true, data: { name: parsed.data.name, durationMinutes: parsed.data.duration!, priceCents: parsed.data.price! } };
}

export type CreateServiceResult = { ok: true; serviceId: string } | { ok: false; error: AccessError | ServiceInputError };

export async function createService(
  input: unknown,
  ctx: { workspaceId: string; unitId: string; actor: Actor | null },
  deps: { insert: (data: ServiceData & { workspaceId: string; unitId: string }) => Promise<{ id: string }> },
): Promise<CreateServiceResult> {
  const accessError = checkAccess(ctx.actor, "services.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = parseService(input);
  if (!parsed.ok) return parsed;

  const service = await deps.insert({ workspaceId: ctx.workspaceId, unitId: ctx.unitId, ...parsed.data });
  return { ok: true, serviceId: service.id };
}

export type UpdateServiceError = AccessError | ServiceInputError | "service_not_found";

export type UpdateServiceResult = { ok: true } | { ok: false; error: UpdateServiceError };

export async function updateService(
  input: unknown,
  serviceId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { update: (serviceId: string, data: ServiceData) => Promise<boolean> },
): Promise<UpdateServiceResult> {
  const accessError = checkAccess(ctx.actor, "services.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!serviceId) return { ok: false, error: "service_not_found" };

  const parsed = parseService(input);
  if (!parsed.ok) return parsed;

  if (!(await deps.update(serviceId, parsed.data))) return { ok: false, error: "service_not_found" };
  return { ok: true };
}

export type DeleteServiceError = AccessError | "service_not_found" | "service_in_use";

export type DeleteServiceResult = { ok: true } | { ok: false; error: DeleteServiceError };

export async function deleteService(
  serviceId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { hasScheduled: (serviceId: string) => Promise<boolean>; remove: (serviceId: string) => Promise<boolean> },
): Promise<DeleteServiceResult> {
  const accessError = checkAccess(ctx.actor, "services.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!serviceId) return { ok: false, error: "service_not_found" };

  if (await deps.hasScheduled(serviceId)) return { ok: false, error: "service_in_use" };

  if (!(await deps.remove(serviceId))) return { ok: false, error: "service_not_found" };
  return { ok: true };
}
