import { parsePriceCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/services/service";

export function parseMoneyCents(value: string) {
  return parsePriceCents(value.trim().replace(",", "."));
}
