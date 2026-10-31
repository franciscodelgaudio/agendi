"use client"

import { useState } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldSeparator } from "@/components/ui/field"
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
    <>
      <FieldSeparator>Estações</FieldSeparator>
      <div className="divide-y border">
        {rows.map((row, index) => (
          <div key={row.key} className="flex items-center gap-2 p-3">
            <input type="hidden" name="stationId" value={row.id} />
            <Input
              id={`${idPrefix}-station-${row.key}`}
              name="stationName"
              placeholder="Maca 1, Hidromassagem..."
              aria-label={`Nome da estação ${index + 1}`}
              value={row.name}
              onChange={(e) => updateRow(row.key, { name: e.target.value })}
              maxLength={40}
              required
            />
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover estação ${index + 1}`}
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              >
                <Trash2Icon />
              </Button>
            )}
          </div>
        ))}

        {rows.length < MAX_STATIONS && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() =>
              setRows((current) => [
                ...current,
                { key: Math.max(...current.map((r) => r.key)) + 1, id: "", name: "" },
              ])
            }
          >
            <PlusIcon />
            Adicionar estação
          </Button>
        )}
      </div>
    </>
  )
}
