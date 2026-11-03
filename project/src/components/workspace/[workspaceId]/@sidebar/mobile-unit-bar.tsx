"use client";

import { useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import {
  UnitMark,
  useUnitPick,
  type SidebarUnit,
} from "@/components/workspace/[workspaceId]/@sidebar/unit-switcher";
import { selectedUnitId } from "@/service/workspace/[workspaceId]/unit-context";

const ALL = "all";
const NEW = "new";

type Option = { id: string; name: string; unit: SidebarUnit | null };

type Props = {
  workspaceId: string;
  units: SidebarUnit[];
  savedUnitId: string | null;
  canCreate: boolean;
};

export function MobileUnitBar({
  workspaceId,
  units,
  savedUnitId,
  canCreate,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const anchorRef = useRef<HTMLDivElement>(null);
  const pick = useUnitPick(workspaceId);
  const base = `/workspace/${workspaceId}`;
  const unitId = selectedUnitId(
    pathname,
    base,
    savedUnitId,
    units.map((unit) => unit.id),
  );
  const selected = units.find((unit) => unit.id === unitId) ?? null;
  if (units.length === 0) return null;

  const all: Option = { id: ALL, name: "Todas as unidades", unit: null };
  const options: Option[] = [
    all,
    ...units.map((unit) => ({ id: unit.id, name: unit.name, unit })),
    ...(canCreate ? [{ id: NEW, name: "Nova unidade", unit: null }] : []),
  ];
  const current =
    options.find((option) => option.id === (selected?.id ?? ALL)) ?? all;

  return (
    <div className="relative z-20 shrink-0 border-b bg-background px-4 py-2 md:hidden">
      <Combobox
        items={options}
        value={current}
        onValueChange={(option: Option | null) => {
          if (!option || option.id === current.id) return;
          if (option.id === NEW) return router.push(`${base}/unit/new`);
          pick(option.unit);
        }}
        itemToStringLabel={(option: Option) => option.name}
        isItemEqualToValue={(a: Option, b: Option) => a.id === b.id}
      >
        <div ref={anchorRef}>
          <ComboboxTrigger className="flex w-full min-w-0 items-center gap-2 text-left">
            <UnitMark unit={selected} />
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate text-xs text-muted-foreground">
                Unidade
              </span>
              <span className="truncate text-sm font-medium">
                {selected?.name ?? "Todas as unidades"}
              </span>
            </span>
          </ComboboxTrigger>
        </div>
        <ComboboxContent
          anchor={anchorRef}
          className="min-w-(--anchor-width) max-w-(--available-width)"
        >
          <ComboboxInput showTrigger={false} placeholder="Buscar unidade..." />
          <ComboboxEmpty>Nenhuma unidade encontrada.</ComboboxEmpty>
          <ComboboxList>
            {(option: Option) => (
              <ComboboxItem key={option.id} value={option}>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  {option.id === NEW ? (
                    <PlusIcon className="size-4 shrink-0" />
                  ) : (
                    <UnitMark
                      unit={option.unit}
                      className="size-6 rounded-none after:rounded-none"
                    />
                  )}
                  <span className="truncate">{option.name}</span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
