"use client"

import { useState } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { FieldHelp, RequiredMark } from "@/components/shared/field-hints"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const MAX_STATIONS = 20

export type StationOption = { id: string; name: string }

type Row = { key: number; id: string; name: string }

function toRows(stations: StationOption[] | undefined): Row[] {
  if (!stations?.length) return [{ key: 0, id: "", name: "" }]
  return stations.map((station, key) => ({ key, ...station }))
}

export function StationFields({ idPrefix, defaultValue }: { idPrefix: string; defaultValue?: StationOption[] }) {
  const [rows, setRows] = useState(() => toRows(defaultValue))

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  return (
    <Field>
      <div className="flex items-center gap-1.5">
        <FieldLabel htmlFor={`${idPrefix}-station-${rows[0].key}`}>
          Estações <RequiredMark />
        </FieldLabel>
        <FieldHelp>Macas, cadeiras ou salas onde os atendimentos acontecem.</FieldHelp>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <div key={row.key} className="flex items-center gap-1">
            <input type="hidden" name="stationId" value={row.id} />
            <Input
              id={`${idPrefix}-station-${row.key}`}
              name="stationName"
              placeholder={index === 0 ? "Maca 1" : `Estação ${index + 1}`}
              aria-label={`Nome da estação ${index + 1}`}
              value={row.name}
              onChange={(e) => updateRow(row.key, { name: e.target.value })}
              maxLength={40}
              className="min-w-0 flex-1"
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remover estação ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}

        {rows.length < MAX_STATIONS && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  { key: Math.max(...current.map((r) => r.key)) + 1, id: "", name: "" },
                ])
              }
            >
              <PlusIcon data-icon="inline-start" />
              Adicionar estação
            </Button>
          </div>
        )}
      </div>
    </Field>
  )
}
