import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";

const MAX_STATIONS = 20;
const MAX_TYPE_LENGTH = 30;

export type StationGroup = { type: string; quantity: number };

export type Station = { id: string; type: string; number: number };

export type StationInput = { id: string | null; type: string; number: number };

export type StationError =
  | "invalid_input"
  | "no_stations"
  | "too_many_stations"
  | "invalid_station_type"
  | "station_type_too_long"
  | "duplicate_station_type"
  | "invalid_station_quantity";

const textList = z.array(z.string({ error: "invalid_input" }), { error: "invalid_input" });

const stationsSchema = z
  .object({ types: textList, quantities: textList }, { error: "invalid_input" })
  .refine(({ types, quantities }) => types.length === quantities.length, { error: "invalid_input" })
  .transform(({ types, quantities }) =>
    types.map((type, i) => ({ type: type.trim(), quantity: quantities[i].trim() })),
  )
  .pipe(
    z
      .array(
        z.object({
          type: z
            .string()
            .min(1, { error: "invalid_station_type" })
            .max(MAX_TYPE_LENGTH, { error: "station_type_too_long" }),
          quantity: z
            .string()
            .regex(/^\d+$/, { error: "invalid_station_quantity" })
            .transform(Number)
            .refine((quantity) => quantity >= 1, { error: "invalid_station_quantity" }),
        }),
      )
      .min(1, { error: "no_stations" })
      .refine(
        (groups) => new Set(groups.map(({ type }) => type.toLowerCase())).size === groups.length,
        { error: "duplicate_station_type" },
      )
      .refine(
        (groups) => groups.reduce((total, { quantity }) => total + quantity, 0) <= MAX_STATIONS,
        { error: "too_many_stations" },
      ),
  );

export function parseStations(input: unknown): { ok: true; value: StationGroup[] } | { ok: false; error: StationError } {
  const parsed = stationsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<StationError>(parsed.error) };
  return { ok: true, value: parsed.data };
}

export function planStations(existing: Station[], groups: StationGroup[]): StationInput[] {
  return groups.flatMap(({ type, quantity }) => {
    const sameType = existing
      .filter((station) => station.type.toLowerCase() === type.toLowerCase())
      .sort((a, b) => a.number - b.number);
    return Array.from({ length: quantity }, (_, i) => ({ id: sameType[i]?.id ?? null, type, number: i + 1 }));
  });
}

export function stationName({ type, number }: { type: string; number: number }) {
  return `${type} ${number}`;
}
