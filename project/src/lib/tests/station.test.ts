import { describe, it, expect } from "vitest";
import { parseStations } from "@/service/workspace/[workspaceId]/unit/[unitId]/station";

const SINGLE_ID = "64b7f0c2a1b2c3d4e5f60781";
const COUPLE_ID = "64b7f0c2a1b2c3d4e5f60782";

describe("parseStations", () => {
  it("lê as estações na ordem do formulário", () => {
    const result = parseStations({
      ids: [SINGLE_ID, ""],
      names: ["Sala Single", "Sala Casal"],
    });

    expect(result).toEqual({
      ok: true,
      value: [
        { id: SINGLE_ID, name: "Sala Single" },
        { id: null, name: "Sala Casal" },
      ],
    });
  });

  it("remove espaços das pontas de id e nome", () => {
    const result = parseStations({ ids: [` ${COUPLE_ID} `], names: ["  Sala Casal  "] });

    expect(result).toEqual({ ok: true, value: [{ id: COUPLE_ID, name: "Sala Casal" }] });
  });

  it("ignora o campo active, se enviado", () => {
    const result = parseStations({ ids: [""], names: ["Sala 1"], active: ["false"] });

    expect(result).toEqual({ ok: true, value: [{ id: null, name: "Sala 1" }] });
  });

  it("aceita 20 estações e nome com 40 caracteres (limites)", () => {
    const names = Array.from({ length: 20 }, (_, i) => `${i}`.padEnd(40, "a"));

    const result = parseStations({ ids: names.map(() => ""), names });

    expect(result.ok).toBe(true);
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nomes ausentes", { ids: [""] }, "invalid_input"],
    ["item que não é string", { ids: [""], names: [1] }, "invalid_input"],
    ["listas de tamanhos diferentes", { ids: ["", ""], names: ["Sala 1"] }, "invalid_input"],
    ["id que não é ObjectId", { ids: ["abc"], names: ["Sala 1"] }, "invalid_input"],
    [
      "id repetido",
      { ids: [SINGLE_ID, SINGLE_ID], names: ["Sala 1", "Sala 2"] },
      "invalid_input",
    ],
    ["nenhuma estação", { ids: [], names: [] }, "no_stations"],
    [
      "mais de 20 estações",
      {
        ids: Array(21).fill(""),
        names: Array.from({ length: 21 }, (_, i) => `Sala ${i}`),
      },
      "too_many_stations",
    ],
    ["nome vazio", { ids: [""], names: ["   "] }, "invalid_station_name"],
    ["nome com mais de 40 caracteres", { ids: [""], names: ["a".repeat(41)] }, "station_name_too_long"],
    [
      "nome repetido, ignorando maiúsculas e espaços",
      { ids: ["", ""], names: ["Sala 1", " sala 1 "] },
      "duplicate_station_name",
    ],
  ])("retorna erro quando há %s", (_label, input, error) => {
    expect(parseStations(input)).toEqual({ ok: false, error });
  });
});
