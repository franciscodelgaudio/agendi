import { describe, it, expect } from "vitest";
import { parseTreatmentRooms } from "@/service/workspace/[workspaceId]/unit/[unitId]/treatment-room";

const SINGLE_ID = "64b7f0c2a1b2c3d4e5f60781";
const COUPLE_ID = "64b7f0c2a1b2c3d4e5f60782";

// Como chega do FormData: uma posição por sala; id vazio = sala nova.
describe("parseTreatmentRooms", () => {
  it("lê as salas na ordem do formulário, com o número de macas", () => {
    const result = parseTreatmentRooms({
      ids: [SINGLE_ID, ""],
      names: ["Sala Single", "Sala Casal"],
      beds: ["1", "2"],
    });

    expect(result).toEqual({
      ok: true,
      value: [
        { id: SINGLE_ID, name: "Sala Single", beds: 1 },
        { id: null, name: "Sala Casal", beds: 2 },
      ],
    });
  });

  it("remove espaços das pontas de id, nome e macas", () => {
    const result = parseTreatmentRooms({ ids: [` ${COUPLE_ID} `], names: ["  Sala Casal  "], beds: [" 2 "] });

    expect(result).toEqual({ ok: true, value: [{ id: COUPLE_ID, name: "Sala Casal", beds: 2 }] });
  });

  it("aceita 20 salas, nome com 40 caracteres e 1 ou 10 macas (limites)", () => {
    const names = Array.from({ length: 20 }, (_, i) => `${i}`.padEnd(40, "a"));
    const beds = names.map((_, i) => (i % 2 ? "10" : "1"));

    const result = parseTreatmentRooms({ ids: names.map(() => ""), names, beds });

    expect(result.ok).toBe(true);
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nomes ausentes", { ids: [""], beds: ["1"] }, "invalid_input"],
    ["macas não são lista", { ids: [""], names: ["Sala 1"], beds: "1" }, "invalid_input"],
    ["item que não é string", { ids: [""], names: [1], beds: ["1"] }, "invalid_input"],
    ["listas de tamanhos diferentes", { ids: ["", ""], names: ["Sala 1"], beds: ["1"] }, "invalid_input"],
    ["id que não é ObjectId", { ids: ["abc"], names: ["Sala 1"], beds: ["1"] }, "invalid_input"],
    [
      "id repetido",
      { ids: [SINGLE_ID, SINGLE_ID], names: ["Sala 1", "Sala 2"], beds: ["1", "1"] },
      "invalid_input",
    ],
    ["nenhuma sala", { ids: [], names: [], beds: [] }, "no_treatment_rooms"],
    [
      "mais de 20 salas",
      { ids: Array(21).fill(""), names: Array.from({ length: 21 }, (_, i) => `Sala ${i}`), beds: Array(21).fill("1") },
      "too_many_treatment_rooms",
    ],
    ["nome vazio", { ids: [""], names: ["   "], beds: ["1"] }, "invalid_treatment_room_name"],
    ["nome com mais de 40 caracteres", { ids: [""], names: ["a".repeat(41)], beds: ["1"] }, "treatment_room_name_too_long"],
    [
      "nome repetido, ignorando maiúsculas e espaços",
      { ids: ["", ""], names: ["Sala 1", " sala 1 "], beds: ["1", "2"] },
      "duplicate_treatment_room_name",
    ],
    ["macas vazias", { ids: [""], names: ["Sala 1"], beds: [""] }, "invalid_treatment_room_beds"],
    ["zero macas", { ids: [""], names: ["Sala 1"], beds: ["0"] }, "invalid_treatment_room_beds"],
    ["mais de 10 macas", { ids: [""], names: ["Sala 1"], beds: ["11"] }, "invalid_treatment_room_beds"],
    ["macas fracionadas", { ids: [""], names: ["Sala 1"], beds: ["1.5"] }, "invalid_treatment_room_beds"],
    ["macas negativas", { ids: [""], names: ["Sala 1"], beds: ["-1"] }, "invalid_treatment_room_beds"],
  ])("retorna erro quando há %s", (_label, input, error) => {
    expect(parseTreatmentRooms(input)).toEqual({ ok: false, error });
  });
});
