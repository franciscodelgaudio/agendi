"use client"

import { useState } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

const MAX_ROOMS = 20

export type TreatmentRoomOption = { id: string; name: string; beds: number }

// id vazio = espaço novo.
type Row = { key: number; id: string; name: string; beds: string }

function toRows(rooms: TreatmentRoomOption[] | undefined): Row[] {
  if (!rooms?.length) return [{ key: 0, id: "", name: "", beds: "1" }]
  return rooms.map((room, key) => ({ key, id: room.id, name: room.name, beds: String(room.beds) }))
}

// Espaços da unidade (salas, hidromassagem, sauna...), com quantos atendimentos cada um comporta ao mesmo tempo.
export function TreatmentRoomFields({ idPrefix, defaultValue }: { idPrefix: string; defaultValue?: TreatmentRoomOption[] }) {
  const [rows, setRows] = useState(() => toRows(defaultValue))

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  return (
    <>
      <FieldSeparator>Espaços</FieldSeparator>
      <div className="divide-y border">
        {rows.map((row, index) => (
          <div key={row.key} className="flex items-center gap-2 p-3">
            {/* A ordem dos campos no FormData forma os espaços. */}
            <input type="hidden" name="treatmentRoomId" value={row.id} />
            <Input
              id={`${idPrefix}-room-${row.key}`}
              name="treatmentRoomName"
              placeholder="Sala Casal, Hidromassagem..."
              aria-label={`Nome do espaço ${index + 1}`}
              value={row.name}
              onChange={(e) => updateRow(row.key, { name: e.target.value })}
              maxLength={40}
              required
            />
            <Input
              name="treatmentRoomBeds"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              step={1}
              aria-label={`Capacidade do espaço ${index + 1}`}
              title="Atendimentos ao mesmo tempo"
              className="w-20 shrink-0"
              value={row.beds}
              onChange={(e) => updateRow(row.key, { beds: e.target.value })}
              required
            />
            <span className="shrink-0 text-sm text-muted-foreground">por vez</span>
            {rows.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover espaço ${index + 1}`}
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              >
                <Trash2Icon />
              </Button>
            )}
          </div>
        ))}

        {rows.length < MAX_ROOMS && (
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() =>
              setRows((current) => [
                ...current,
                { key: Math.max(...current.map((r) => r.key)) + 1, id: "", name: "", beds: "1" },
              ])
            }
          >
            <PlusIcon />
            Adicionar espaço
          </Button>
        )}
      </div>
    </>
  )
}
