import { describe, it, expect } from "vitest";
import { parseStations } from "@/service/workspace/[workspaceId]/unit/[unitId]/station";

const SINGLE_ID = "64b7f0c2a1b2c3d4e5f60781";
const COUPLE_ID = "64b7f0c2a1b2c3d4e5f60782";

describe("parseStations", () => {
  it("lê as estações na ordem do formulário, ativas ou não", () => {
    const result = parseStations({
      ids: [SINGLE_ID, ""],
      names: ["Sala Single", "Sala Casal"],
      active: ["true", "false"],
    });

    expect(result).toEqual({
      ok: true,
      value: [
        { id: SINGLE_ID, name: "Sala Single", active: true },
        { id: null, name: "Sala Casal", active: false },
      ],
    });
  });

  it("remove espaços das pontas de id e nome", () => {
    const result = parseStations({ ids: [` ${COUPLE_ID} `], names: ["  Sala Casal  "], active: ["true"] });

    expect(result).toEqual({ ok: true, value: [{ id: COUPLE_ID, name: "Sala Casal", active: true }] });
  });

  it("aceita 20 estações e nome com 40 caracteres (limites)", () => {
    const names = Array.from({ length: 20 }, (_, i) => `${i}`.padEnd(40, "a"));

    const result = parseStations({ ids: names.map(() => ""), names, active: names.map(() => "true") });

    expect(result.ok).toBe(true);
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nomes ausentes", { ids: [""], active: ["true"] }, "invalid_input"],
    ["ativa ausente", { ids: [""], names: ["Sala 1"] }, "invalid_input"],
    ["ativa que não é lista", { ids: [""], names: ["Sala 1"], active: "true" }, "invalid_input"],
    ["ativa que não é true nem false", { ids: [""], names: ["Sala 1"], active: ["sim"] }, "invalid_input"],
    ["item que não é string", { ids: [""], names: [1], active: ["true"] }, "invalid_input"],
    ["listas de tamanhos diferentes", { ids: ["", ""], names: ["Sala 1"], active: ["true"] }, "invalid_input"],
    ["id que não é ObjectId", { ids: ["abc"], names: ["Sala 1"], active: ["true"] }, "invalid_input"],
    [
      "id repetido",
      { ids: [SINGLE_ID, SINGLE_ID], names: ["Sala 1", "Sala 2"], active: ["true", "true"] },
      "invalid_input",
    ],
    ["nenhuma estação", { ids: [], names: [], active: [] }, "no_stations"],
    [
      "mais de 20 estações",
      {
        ids: Array(21).fill(""),
        names: Array.from({ length: 21 }, (_, i) => `Sala ${i}`),
        active: Array(21).fill("true"),
      },
      "too_many_stations",
    ],
    ["nome vazio", { ids: [""], names: ["   "], active: ["true"] }, "invalid_station_name"],
    ["nome com mais de 40 caracteres", { ids: [""], names: ["a".repeat(41)], active: ["true"] }, "station_name_too_long"],
    [
      "nome repetido, ignorando maiúsculas e espaços",
      { ids: ["", ""], names: ["Sala 1", " sala 1 "], active: ["true", "false"] },
      "duplicate_station_name",
    ],
  ])("retorna erro quando há %s", (_label, input, error) => {
    expect(parseStations(input)).toEqual({ ok: false, error });
  });
});
