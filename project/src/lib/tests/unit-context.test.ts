import { describe, it, expect } from "vitest";
import {
  sectionHref,
  sectionOf,
  selectedUnitId,
  switchUnitHref,
  unitFromPath,
} from "@/service/workspace/[workspaceId]/unit-context";

const BASE = "/workspace/64b7f0c2a1b2c3d4e5f60718";
const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const OTHER_UNIT_ID = "64b7f0c2a1b2c3d4e5f60721";
const INVENTORY_ID = "64b7f0c2a1b2c3d4e5f60850";
const UNIT = { id: UNIT_ID, inventoryId: INVENTORY_ID };
const OTHER_UNIT = { id: OTHER_UNIT_ID, inventoryId: null };

describe("unitFromPath", () => {
  it.each([
    [`${BASE}/unit/${UNIT_ID}`, UNIT_ID],
    [`${BASE}/unit/${UNIT_ID}/cash-flow/statements`, UNIT_ID],
    [`${BASE}/unit`, null],
    [`${BASE}/unit/new`, null],
    [`${BASE}/calendar`, null],
  ])("%s", (pathname, expected) => {
    expect(unitFromPath(pathname, BASE)).toBe(expected);
  });
});

describe("sectionOf", () => {
  it.each([
    [BASE, "inicio"],
    [`${BASE}/unit/${UNIT_ID}`, "inicio"],
    [`${BASE}/calendar`, "agenda"],
    [`${BASE}/unit/${UNIT_ID}/calendar`, "agenda"],
    [`${BASE}/customers`, "clientes"],
    [`${BASE}/cash-flow`, "caixa"],
    [`${BASE}/cash-flow/wallets/${UNIT_ID}/statements`, "caixa"],
    [`${BASE}/unit/${UNIT_ID}/cash-flow/transactions`, "caixa"],
    [`${BASE}/partners`, "parceiros"],
    [`${BASE}/unit/${UNIT_ID}/services`, "servicos"],
    [`${BASE}/stock`, "estoque"],
    [`${BASE}/stock/${INVENTORY_ID}/movements`, "estoque"],
    [`${BASE}/unit`, "unidades"],
    [`${BASE}/unit/new`, "unidades"],
    [`${BASE}/users/permissions`, "usuarios"],
    ["/outro/lugar", null],
  ])("%s é %s", (pathname, expected) => {
    expect(sectionOf(pathname, BASE)).toBe(expected);
  });
});

describe("sectionHref", () => {
  it.each([
    ["inicio", null, BASE],
    ["inicio", UNIT, `${BASE}/unit/${UNIT_ID}`],
    ["agenda", null, `${BASE}/calendar`],
    ["agenda", UNIT, `${BASE}/unit/${UNIT_ID}/calendar`],
    ["caixa", null, `${BASE}/cash-flow`],
    ["caixa", UNIT, `${BASE}/unit/${UNIT_ID}/cash-flow`],
    ["servicos", null, null],
    ["servicos", UNIT, `${BASE}/unit/${UNIT_ID}/services`],
    ["estoque", null, `${BASE}/stock`],
    ["estoque", UNIT, `${BASE}/stock/${INVENTORY_ID}`],
    ["estoque", OTHER_UNIT, `${BASE}/stock`],
    ["clientes", UNIT, `${BASE}/customers`],
    ["parceiros", null, `${BASE}/partners`],
    ["unidades", UNIT, `${BASE}/unit`],
    ["usuarios", null, `${BASE}/users`],
  ] as const)("%s com %j", (section, unit, expected) => {
    expect(sectionHref(section, BASE, unit)).toBe(expected);
  });
});

describe("selectedUnitId", () => {
  const unitIds = [UNIT_ID, OTHER_UNIT_ID];

  it("a unidade da URL vence a salva", () => {
    expect(selectedUnitId(`${BASE}/unit/${UNIT_ID}/calendar`, BASE, OTHER_UNIT_ID, unitIds)).toBe(UNIT_ID);
  });

  it.each([BASE, `${BASE}/calendar`, `${BASE}/cash-flow`])(
    "a versão geral de %s é \"todas as unidades\", mesmo com unidade salva",
    (pathname) => {
      expect(selectedUnitId(pathname, BASE, UNIT_ID, unitIds)).toBeNull();
    },
  );

  it.each([`${BASE}/customers`, `${BASE}/partners`, `${BASE}/stock`, `${BASE}/users`, `${BASE}/unit`])(
    "%s mantém a unidade salva",
    (pathname) => {
      expect(selectedUnitId(pathname, BASE, UNIT_ID, unitIds)).toBe(UNIT_ID);
    },
  );

  it("ignora unidade salva que não existe mais", () => {
    expect(selectedUnitId(`${BASE}/customers`, BASE, "64b7f0c2a1b2c3d4e5f60799", unitIds)).toBeNull();
  });

  it("sem unidade salva fica em todas as unidades", () => {
    expect(selectedUnitId(`${BASE}/customers`, BASE, null, unitIds)).toBeNull();
  });
});

describe("switchUnitHref", () => {
  it.each([
    [`${BASE}/unit/${UNIT_ID}/cash-flow/statements`, OTHER_UNIT, `${BASE}/unit/${OTHER_UNIT_ID}/cash-flow`],
    [`${BASE}/unit/${UNIT_ID}/cash-flow/statements`, null, `${BASE}/cash-flow`],
    [`${BASE}/calendar`, UNIT, `${BASE}/unit/${UNIT_ID}/calendar`],
    [BASE, UNIT, `${BASE}/unit/${UNIT_ID}`],
    [`${BASE}/unit/${UNIT_ID}/services`, OTHER_UNIT, `${BASE}/unit/${OTHER_UNIT_ID}/services`],
    [`${BASE}/stock`, UNIT, `${BASE}/stock/${INVENTORY_ID}`],
    [`${BASE}/stock/${INVENTORY_ID}`, null, `${BASE}/stock`],
  ] as const)("de %s para %j vai para %s", (pathname, unit, expected) => {
    expect(switchUnitHref(pathname, BASE, unit)).toBe(expected);
  });

  it("serviços sem unidade voltam para o início", () => {
    expect(switchUnitHref(`${BASE}/unit/${UNIT_ID}/services`, BASE, null)).toBe(BASE);
  });

  it.each([`${BASE}/customers`, `${BASE}/partners`, `${BASE}/users/permissions`, `${BASE}/unit`])(
    "%s não depende da unidade e continua na mesma página",
    (pathname) => {
      expect(switchUnitHref(pathname, BASE, UNIT)).toBe(pathname);
    },
  );
});
