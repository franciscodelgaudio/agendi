import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";
import { checkAccess, type AccessError } from "@/service/workspace/[workspaceId]/users/permissions/access-check";
import type { Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions";

const MAX_NAME_LENGTH = 120;
const MAX_OBSERVATION_LENGTH = 1000;
const MIN_CELLPHONE_DIGITS = 10;
const MAX_CELLPHONE_DIGITS = 13;

const customerSchema = z.object(
  {
    name: z
      .string({ error: "invalid_input" })
      .trim()
      .min(1, { error: "invalid_name" })
      .max(MAX_NAME_LENGTH, { error: "name_too_long" }),
    observation: z
      .string({ error: "invalid_input" })
      .trim()
      .max(MAX_OBSERVATION_LENGTH, { error: "observation_too_long" })
      .nullish()
      .transform((value) => value || null),
    cellphone: z
      .string({ error: "invalid_input" })
      .trim()
      .nullish()
      .transform((value) => (value ? value.replace(/\D/g, "") : null))
      .refine(
        (digits) => digits === null || (digits.length >= MIN_CELLPHONE_DIGITS && digits.length <= MAX_CELLPHONE_DIGITS),
        { error: "invalid_cellphone" },
      ),
  },
  { error: "invalid_input" },
);

export type CustomerData = z.infer<typeof customerSchema>;

export type CustomerInputError =
  | "invalid_input"
  | "invalid_name"
  | "name_too_long"
  | "observation_too_long"
  | "invalid_cellphone";

export type CreateCustomerError = AccessError | CustomerInputError;

export type CreateCustomerResult = { ok: true; customerId: string } | { ok: false; error: CreateCustomerError };

export async function createCustomer(
  input: unknown,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: { insert: (data: CustomerData & { workspaceId: string }) => Promise<{ id: string }> },
): Promise<CreateCustomerResult> {
  const accessError = checkAccess(ctx.actor, "customers.manage");
  if (accessError) return { ok: false, error: accessError };

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<CustomerInputError>(parsed.error) };

  const customer = await deps.insert({ workspaceId: ctx.workspaceId, ...parsed.data });
  return { ok: true, customerId: customer.id };
}

export type UpdateCustomerError = AccessError | CustomerInputError | "customer_not_found";

export type UpdateCustomerResult = { ok: true } | { ok: false; error: UpdateCustomerError };

export async function updateCustomer(
  input: unknown,
  customerId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { update: (customerId: string, data: CustomerData) => Promise<boolean> },
): Promise<UpdateCustomerResult> {
  const accessError = checkAccess(ctx.actor, "customers.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!customerId) return { ok: false, error: "customer_not_found" };

  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<CustomerInputError>(parsed.error) };

  if (!(await deps.update(customerId, parsed.data))) return { ok: false, error: "customer_not_found" };
  return { ok: true };
}

export type DeleteCustomerError = AccessError | "customer_not_found";

export type DeleteCustomerResult = { ok: true } | { ok: false; error: DeleteCustomerError };

export async function deleteCustomer(
  customerId: string | null | undefined,
  ctx: { actor: Actor | null },
  deps: { remove: (customerId: string) => Promise<boolean> },
): Promise<DeleteCustomerResult> {
  const accessError = checkAccess(ctx.actor, "customers.manage");
  if (accessError) return { ok: false, error: accessError };
  if (!customerId) return { ok: false, error: "customer_not_found" };

  if (!(await deps.remove(customerId))) return { ok: false, error: "customer_not_found" };
  return { ok: true };
}
