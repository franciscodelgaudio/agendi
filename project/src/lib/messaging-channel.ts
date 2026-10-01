import { can, type Actor } from "@/lib/permissions";
import { MESSAGING_PLATFORMS, type MessagingPlatform } from "@/lib/messaging-types";

const MAX_NAME_LENGTH = 60;
const MAX_TOKEN_LENGTH = 2048;
// phone_number_id do WhatsApp e id da conta do Instagram são só dígitos.
const EXTERNAL_ID_PATTERN = /^\d{5,32}$/;

type ActorError = "workspace_not_found" | "forbidden";

function checkActor(actor: Actor | null): ActorError | null {
  if (!actor) return "workspace_not_found";
  return can(actor, "channels.manage") ? null : "forbidden";
}

type NameError = "invalid_name" | "name_too_long";

function parseName(name: string): { ok: true; name: string } | { ok: false; error: NameError } {
  const normalized = name.trim();
  if (!normalized) return { ok: false, error: "invalid_name" };
  if (normalized.length > MAX_NAME_LENGTH) return { ok: false, error: "name_too_long" };
  return { ok: true, name: normalized };
}

function isValidToken(token: string) {
  return token.length > 0 && token.length <= MAX_TOKEN_LENGTH && !/\s/.test(token);
}

export type CreateChannelError =
  | ActorError
  | NameError
  | "invalid_input"
  | "invalid_platform"
  | "invalid_external_id"
  | "invalid_access_token"
  | "external_id_taken";

export type CreateChannelResult = { ok: true; channelId: string } | { ok: false; error: CreateChannelError };

export type ChannelData = {
  workspaceId: string;
  platform: MessagingPlatform;
  name: string;
  externalId: string;
  accessTokenEncrypted: string;
};

export async function createChannel(
  input: unknown,
  ctx: { workspaceId: string; actor: Actor | null },
  deps: {
    // O webhook identifica o canal pelo id externo, então ele só pode estar em um workspace.
    isExternalIdTaken: (platform: MessagingPlatform, externalId: string) => Promise<boolean>;
    insert: (data: ChannelData) => Promise<{ id: string }>;
    encrypt: (token: string) => string;
  },
): Promise<CreateChannelResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };

  if (!input || typeof input !== "object") return { ok: false, error: "invalid_input" };
  const { platform, name, externalId, accessToken } = input as Record<string, unknown>;
  if (!MESSAGING_PLATFORMS.includes(platform as MessagingPlatform)) return { ok: false, error: "invalid_platform" };
  if (typeof name !== "string" || typeof externalId !== "string" || typeof accessToken !== "string") {
    return { ok: false, error: "invalid_input" };
  }

  const parsedName = parseName(name);
  if (!parsedName.ok) return parsedName;

  const normalizedId = externalId.trim();
  if (!EXTERNAL_ID_PATTERN.test(normalizedId)) return { ok: false, error: "invalid_external_id" };

  const token = accessToken.trim();
  if (!isValidToken(token)) return { ok: false, error: "invalid_access_token" };

  const validPlatform = platform as MessagingPlatform;
  if (await deps.isExternalIdTaken(validPlatform, normalizedId)) return { ok: false, error: "external_id_taken" };

  const channel = await deps.insert({
    workspaceId: ctx.workspaceId,
    platform: validPlatform,
    name: parsedName.name,
    externalId: normalizedId,
    accessTokenEncrypted: deps.encrypt(token),
  });
  return { ok: true, channelId: channel.id };
}

export type UpdateChannelError = ActorError | NameError | "channel_not_found" | "invalid_input" | "invalid_access_token";

export type UpdateChannelResult = { ok: true } | { ok: false; error: UpdateChannelError };

// Plataforma e id externo não mudam: as conversas do canal dependem deles.
// Token vazio mantém o atual.
export async function updateChannel(
  input: unknown,
  ctx: { actor: Actor | null; channelId: string | null | undefined },
  deps: {
    // false quando o canal não existe (ou não é do workspace).
    update: (channelId: string, data: { name: string; accessTokenEncrypted?: string }) => Promise<boolean>;
    encrypt: (token: string) => string;
  },
): Promise<UpdateChannelResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  if (!ctx.channelId) return { ok: false, error: "channel_not_found" };

  const { name, accessToken } = (input ?? {}) as Record<string, unknown>;
  if (typeof name !== "string" || typeof accessToken !== "string") return { ok: false, error: "invalid_input" };

  const parsedName = parseName(name);
  if (!parsedName.ok) return parsedName;

  const token = accessToken.trim();
  if (token && !isValidToken(token)) return { ok: false, error: "invalid_access_token" };

  const found = await deps.update(ctx.channelId, {
    name: parsedName.name,
    ...(token ? { accessTokenEncrypted: deps.encrypt(token) } : {}),
  });
  return found ? { ok: true } : { ok: false, error: "channel_not_found" };
}

export type DeleteChannelResult = { ok: true } | { ok: false; error: ActorError | "channel_not_found" };

// remove devolve false quando o canal não existe (ou não é do workspace).
export async function deleteChannel(
  ctx: { actor: Actor | null; channelId: string | null | undefined },
  remove: (channelId: string) => Promise<boolean>,
): Promise<DeleteChannelResult> {
  const actorError = checkActor(ctx.actor);
  if (actorError) return { ok: false, error: actorError };
  if (!ctx.channelId) return { ok: false, error: "channel_not_found" };

  const found = await remove(ctx.channelId);
  return found ? { ok: true } : { ok: false, error: "channel_not_found" };
}
