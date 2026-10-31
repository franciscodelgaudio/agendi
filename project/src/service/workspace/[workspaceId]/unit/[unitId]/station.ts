import { z } from "zod";
import { issueCode } from "@/service/_shared/validation";

const MAX_STATIONS = 20;
const MAX_NAME_LENGTH = 40;
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export type StationInput = { id: string | null; name: string; active: boolean };

export type StationError =
  | "invalid_input"
  | "no_stations"
  | "too_many_stations"
  | "invalid_station_name"
  | "station_name_too_long"
  | "duplicate_station_name";

const textList = z.array(z.string({ error: "invalid_input" }), { error: "invalid_input" });

const stationsSchema = z
  .object(
    {
      ids: textList.transform((ids) => ids.map((id) => id.trim())),
      names: textList,
      active: z.array(z.enum(["true", "false"], { error: "invalid_input" }), { error: "invalid_input" }),
    },
    { error: "invalid_input" },
  )
  .refine(({ ids, names, active }) => ids.length === names.length && active.length === names.length, {
    error: "invalid_input",
  })
  .refine(({ ids }) => {
    const existing = ids.filter(Boolean);
    return existing.every((id) => OBJECT_ID.test(id)) && new Set(existing).size === existing.length;
  }, { error: "invalid_input" })
  .transform(({ ids, names, active }) =>
    names.map((name, i) => ({ id: ids[i] || null, name: name.trim(), active: active[i] === "true" })),
  )
  .pipe(
    z
      .array(
        z.object({
          id: z.string().nullable(),
          name: z
            .string()
            .min(1, { error: "invalid_station_name" })
            .max(MAX_NAME_LENGTH, { error: "station_name_too_long" }),
          active: z.boolean(),
        }),
      )
      .min(1, { error: "no_stations" })
      .max(MAX_STATIONS, { error: "too_many_stations" })
      .refine(
        (stations) => new Set(stations.map(({ name }) => name.toLowerCase())).size === stations.length,
        { error: "duplicate_station_name" },
      ),
  );

export function parseStations(input: unknown): { ok: true; value: StationInput[] } | { ok: false; error: StationError } {
  const parsed = stationsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: issueCode<StationError>(parsed.error) };
  return { ok: true, value: parsed.data };
}
