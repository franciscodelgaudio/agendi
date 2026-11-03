import { describe, it, expect } from "vitest";
import { parseStations, planStations, stationName } from "@/service/workspace/[workspaceId]/unit/[unitId]/station";

const MACA_1 = "64b7f0c2a1b2c3d4e5f60781";
const MACA_2 = "64b7f0c2a1b2c3d4e5f60782";
const MACA_3 = "64b7f0c2a1b2c3d4e5f60783";
const CADEIRA_1 = "64b7f0c2a1b2c3d4e5f60784";

describe("parseStations", () => {
  it("lê os grupos de tipo e quantidade na ordem do formulário", () => {
    const result = parseStations({ types: ["Maca", "Cadeira"], quantities: ["3", "2"] });

    expect(result).toEqual({
      ok: true,
      value: [
        { type: "Maca", quantity: 3 },
        { type: "Cadeira", quantity: 2 },
      ],
    });
  });

  it("remove espaços das pontas do tipo e da quantidade", () => {
    const result = parseStations({ types: ["  Sala Casal  "], quantities: [" 2 "] });

    expect(result).toEqual({ ok: true, value: [{ type: "Sala Casal", quantity: 2 }] });
  });

  it("aceita 20 estações no total e tipo com 30 caracteres (limites)", () => {
    const result = parseStations({ types: ["a".repeat(30), "Maca"], quantities: ["15", "5"] });

    expect(result.ok).toBe(true);
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["quantidades ausentes", { types: ["Maca"] }, "invalid_input"],
    ["tipo que não é string", { types: [1], quantities: ["1"] }, "invalid_input"],
    ["quantidade que não é string", { types: ["Maca"], quantities: [1] }, "invalid_input"],
    ["listas de tamanhos diferentes", { types: ["Maca", "Sala"], quantities: ["1"] }, "invalid_input"],
    ["nenhum grupo", { types: [], quantities: [] }, "no_stations"],
    ["tipo vazio", { types: ["   "], quantities: ["1"] }, "invalid_station_type"],
    ["tipo com mais de 30 caracteres", { types: ["a".repeat(31)], quantities: ["1"] }, "station_type_too_long"],
    ["tipo repetido, ignorando maiúsculas e espaços", { types: ["Maca", " maca "], quantities: ["1", "1"] }, "duplicate_station_type"],
    ["quantidade zero", { types: ["Maca"], quantities: ["0"] }, "invalid_station_quantity"],
    ["quantidade negativa", { types: ["Maca"], quantities: ["-1"] }, "invalid_station_quantity"],
    ["quantidade fracionada", { types: ["Maca"], quantities: ["1.5"] }, "invalid_station_quantity"],
    ["quantidade vazia", { types: ["Maca"], quantities: [""] }, "invalid_station_quantity"],
    ["quantidade que não é número", { types: ["Maca"], quantities: ["abc"] }, "invalid_station_quantity"],
    ["mais de 20 estações no total", { types: ["Maca", "Sala"], quantities: ["15", "6"] }, "too_many_stations"],
  ])("retorna erro quando há %s", (_label, input, error) => {
    expect(parseStations(input)).toEqual({ ok: false, error });
  });
});

describe("planStations", () => {
  it("sem estações existentes, numera cada tipo de 1 até a quantidade, todas novas", () => {
    const result = planStations([], [
      { type: "Maca", quantity: 2 },
      { type: "Cadeira", quantity: 1 },
    ]);

    expect(result).toEqual([
      { id: null, type: "Maca", number: 1 },
      { id: null, type: "Maca", number: 2 },
      { id: null, type: "Cadeira", number: 1 },
    ]);
  });

  it("mantém as estações existentes do mesmo tipo e cria as que faltam", () => {
    const existing = [{ id: MACA_1, type: "Maca", number: 1 }];

    const result = planStations(existing, [{ type: "Maca", quantity: 3 }]);

    expect(result).toEqual([
      { id: MACA_1, type: "Maca", number: 1 },
      { id: null, type: "Maca", number: 2 },
      { id: null, type: "Maca", number: 3 },
    ]);
  });

  it("ao diminuir a quantidade, remove as estações de número maior", () => {
    const existing = [
      { id: MACA_3, type: "Maca", number: 3 },
      { id: MACA_1, type: "Maca", number: 1 },
      { id: MACA_2, type: "Maca", number: 2 },
    ];

    const result = planStations(existing, [{ type: "Maca", quantity: 2 }]);

    expect(result).toEqual([
      { id: MACA_1, type: "Maca", number: 1 },
      { id: MACA_2, type: "Maca", number: 2 },
    ]);
  });

  it("casa o tipo ignorando maiúsculas e salva com a grafia nova", () => {
    const existing = [{ id: MACA_1, type: "maca", number: 1 }];

    const result = planStations(existing, [{ type: "Maca", quantity: 1 }]);

    expect(result).toEqual([{ id: MACA_1, type: "Maca", number: 1 }]);
  });

  it("remove as estações de um tipo que saiu e segue a ordem nova dos grupos", () => {
    const existing = [
      { id: MACA_1, type: "Maca", number: 1 },
      { id: CADEIRA_1, type: "Cadeira", number: 1 },
    ];

    const result = planStations(existing, [
      { type: "Sala", quantity: 1 },
      { type: "Cadeira", quantity: 1 },
    ]);

    expect(result).toEqual([
      { id: null, type: "Sala", number: 1 },
      { id: CADEIRA_1, type: "Cadeira", number: 1 },
    ]);
  });
});

describe("stationName", () => {
  it("junta o tipo e o número", () => {
    expect(stationName({ type: "Maca", number: 2 })).toBe("Maca 2");
  });
});
