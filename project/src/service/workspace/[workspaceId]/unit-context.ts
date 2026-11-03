export type NavSection =
  | "inicio"
  | "agenda"
  | "clientes"
  | "caixa"
  | "parceiros"
  | "servicos"
  | "estoque"
  | "unidades"
  | "usuarios";

export type ContextUnit = { id: string; inventoryId: string | null };

export function unitCookieName(workspaceId: string) {
  return `agendi_unit_${workspaceId}`;
}

const UNIT_PATH = /^\/unit\/([0-9a-f]{24})(\/.*)?$/i;
const SCOPED_SECTIONS: NavSection[] = ["inicio", "agenda", "caixa", "servicos", "estoque"];
const ALL_SCOPED: NavSection[] = ["inicio", "agenda", "caixa"];

const GLOBAL_PREFIXES: [string, NavSection][] = [
  ["/calendar", "agenda"],
  ["/customers", "clientes"],
  ["/cash-flow", "caixa"],
  ["/partners", "parceiros"],
  ["/stock", "estoque"],
  ["/unit", "unidades"],
  ["/users", "usuarios"],
];

const UNIT_PREFIXES: [string, NavSection][] = [
  ["/calendar", "agenda"],
  ["/cash-flow", "caixa"],
  ["/services", "servicos"],
];

function within(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function rest(pathname: string, base: string) {
  if (pathname === base) return "";
  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : null;
}

export function unitFromPath(pathname: string, base: string) {
  const path = rest(pathname, base);
  return path === null ? null : (UNIT_PATH.exec(path)?.[1] ?? null);
}

export function sectionOf(pathname: string, base: string): NavSection | null {
  const path = rest(pathname, base);
  if (path === null) return null;
  if (path === "") return "inicio";
  const unit = UNIT_PATH.exec(path);
  if (unit) {
    const sub = unit[2] ?? "";
    if (!sub) return "inicio";
    return UNIT_PREFIXES.find(([prefix]) => within(sub, prefix))?.[1] ?? null;
  }
  return GLOBAL_PREFIXES.find(([prefix]) => within(path, prefix))?.[1] ?? null;
}

export function sectionHref(section: NavSection, base: string, unit: ContextUnit | null) {
  const unitBase = unit && `${base}/unit/${unit.id}`;
  switch (section) {
    case "inicio":
      return unitBase ?? base;
    case "agenda":
      return `${unitBase ?? base}/calendar`;
    case "caixa":
      return `${unitBase ?? base}/cash-flow`;
    case "servicos":
      return unitBase && `${unitBase}/services`;
    case "estoque":
      return unit?.inventoryId ? `${base}/stock/${unit.inventoryId}` : `${base}/stock`;
    case "clientes":
      return `${base}/customers`;
    case "parceiros":
      return `${base}/partners`;
    case "unidades":
      return `${base}/unit`;
    case "usuarios":
      return `${base}/users`;
  }
}

export function selectedUnitId(pathname: string, base: string, savedUnitId: string | null, unitIds: string[]) {
  const fromPath = unitFromPath(pathname, base);
  if (fromPath) return fromPath;
  const section = sectionOf(pathname, base);
  if (section && ALL_SCOPED.includes(section)) return null;
  return savedUnitId && unitIds.includes(savedUnitId) ? savedUnitId : null;
}

export function switchUnitHref(pathname: string, base: string, unit: ContextUnit | null) {
  const section = sectionOf(pathname, base) ?? "inicio";
  if (!SCOPED_SECTIONS.includes(section) || (!unit && pathname === `${base}/stock/products`)) return pathname;
  return sectionHref(section, base, unit) ?? base;
}
