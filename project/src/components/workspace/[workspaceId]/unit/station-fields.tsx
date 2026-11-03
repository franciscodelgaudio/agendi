"use client"

import { useState } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"

import { FieldHelp, RequiredMark } from "@/components/shared/field-hints"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { StationGroup } from "@/service/workspace/[workspaceId]/unit/[unitId]/station"

const MAX_STATIONS = 20
const OTHER = "other"
const PRESET_TYPES = ["Maca", "Cadeira", "Sala", "Box"]
const TYPE_ITEMS = [...PRESET_TYPES.map((type) => ({ value: type, label: type })), { value: OTHER, label: "Outro" }]

type Row = { key: number; preset: string; custom: string; quantity: string }

function toRow(key: number, { type, quantity }: StationGroup): Row {
  const preset = PRESET_TYPES.find((option) => option.toLowerCase() === type.toLowerCase())
  return { key, preset: preset ?? OTHER, custom: preset ? "" : type, quantity: String(quantity) }
}

function toRows(groups: StationGroup[] | undefined): Row[] {
  if (!groups?.length) return [{ key: 0, preset: PRESET_TYPES[0], custom: "", quantity: "1" }]
  return groups.map((group, key) => toRow(key, group))
}

function typeOf(row: Row) {
  return (row.preset === OTHER ? row.custom : row.preset).trim()
}

function quantityOf(row: Row) {
  return /^\d+$/.test(row.quantity.trim()) ? Number(row.quantity) : 0
}

function summary(rows: Row[]) {
  const total = rows.reduce((sum, row) => sum + quantityOf(row), 0)
  const parts = rows
    .filter((row) => typeOf(row) && quantityOf(row) > 0)
    .map((row) => (quantityOf(row) === 1 ? `${typeOf(row)} 1` : `${typeOf(row)} 1 a ${quantityOf(row)}`))
  return `${total} ${total === 1 ? "estação" : "estações"}${parts.length ? `: ${parts.join(", ")}` : ""}`
}

export function StationFields({ idPrefix, defaultValue }: { idPrefix: string; defaultValue?: StationGroup[] }) {
  const [rows, setRows] = useState(() => toRows(defaultValue))
  const usedPresets = new Set(rows.map((row) => row.preset))

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        key: Math.max(...current.map((r) => r.key)) + 1,
        preset: PRESET_TYPES.find((type) => !usedPresets.has(type)) ?? OTHER,
        custom: "",
        quantity: "1",
      },
    ])
  }

  return (
    <Field>
      <div className="flex items-center gap-1.5">
        <FieldLabel htmlFor={`${idPrefix}-station-quantity-${rows[0].key}`}>
          Estações <RequiredMark />
        </FieldLabel>
        <FieldHelp>
          Informe o tipo e quantas existem de cada um. Os nomes são gerados sozinhos: Maca 1, Maca 2…
        </FieldHelp>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <div key={row.key} className="flex items-center gap-1">
            <input type="hidden" name="stationType" value={typeOf(row)} />
            <Select
              items={TYPE_ITEMS}
              value={row.preset}
              onValueChange={(value) => updateRow(row.key, { preset: value as string })}
            >
              <SelectTrigger className="w-32 shrink-0" aria-label={`Tipo da estação ${index + 1}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_ITEMS.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    disabled={item.value !== OTHER && item.value !== row.preset && usedPresets.has(item.value)}
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {row.preset === OTHER && (
              <Input
                placeholder="Sala Casal"
                aria-label={`Nome do tipo da estação ${index + 1}`}
                value={row.custom}
                onChange={(e) => updateRow(row.key, { custom: e.target.value })}
                maxLength={30}
                className="min-w-0 flex-1"
                required
              />
            )}
            <Input
              id={`${idPrefix}-station-quantity-${row.key}`}
              name="stationQuantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_STATIONS}
              step={1}
              aria-label={`Quantidade da estação ${index + 1}`}
              value={row.quantity}
              onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
              className={row.preset === OTHER ? "w-20 shrink-0" : "min-w-0 flex-1"}
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remover tipo de estação ${index + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}

        <FieldDescription>{summary(rows)}</FieldDescription>

        <div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <PlusIcon data-icon="inline-start" />
            Adicionar tipo
          </Button>
        </div>
      </div>
    </Field>
  )
}
