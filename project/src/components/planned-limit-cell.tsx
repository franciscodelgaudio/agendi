"use client"

import { useRef, useState, useTransition, type KeyboardEvent } from "react"
import { toast } from "sonner"
import { updateGroupMonthLimitAction } from "@/lib/actions/expense"
import { AmountInput } from "@/components/amount-input"
import { currencyFormat } from "@/components/service-format"
import { cn } from "@/lib/utils"

type Props = {
  workspaceId: string
  unitId: string
  groupId: string
  // Mês da célula ("AAAA-MM") e o limite dele; null = sem limite.
  month: string
  cents: number | null
  // Ids das células de planejado do grupo, para o foco andar como numa planilha.
  cellId: string
  nextCellId: string | null
}

// Planejado de um grupo num mês, editável no lugar: clique, Enter ou um dígito começa a edição;
// Enter salva e desce para o mês seguinte, Tab salva e segue para o lado, Esc cancela.
export function PlannedLimitCell({ workspaceId, unitId, groupId, month, cents, cellId, nextCellId }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<number | null>(cents)
  // Valor salvo e ainda não confirmado pelo servidor; undefined mostra o que veio da página.
  const [optimistic, setOptimistic] = useState<number | null | undefined>(undefined)
  const [, startTransition] = useTransition()
  // Evita salvar duas vezes quando Enter ou Esc também tiram o foco do campo.
  const closed = useRef(false)
  const shown = optimistic !== undefined ? optimistic : cents

  function open(initial: number | null) {
    closed.current = false
    setDraft(initial)
    setEditing(true)
  }

  function save() {
    if (closed.current) return
    closed.current = true
    setEditing(false)
    if (draft === shown) return
    setOptimistic(draft)
    startTransition(async () => {
      const result = await updateGroupMonthLimitAction(
        workspaceId,
        unitId,
        groupId,
        month,
        draft === null ? "" : (draft / 100).toFixed(2),
      )
      if (result.error) {
        setOptimistic(undefined)
        toast.error(result.error)
      }
    })
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      save()
      document.getElementById(nextCellId ?? cellId)?.focus()
    } else if (event.key === "Escape") {
      closed.current = true
      setEditing(false)
      document.getElementById(cellId)?.focus()
    }
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!/^\d$/.test(event.key)) return
    event.preventDefault()
    open(Number(event.key))
  }

  if (editing) {
    return (
      <AmountInput
        value={draft}
        onValueChange={setDraft}
        max={100_000_000}
        placeholder="Sem limite"
        aria-label="Planejado"
        autoFocus
        onBlur={save}
        onKeyDown={handleInputKeyDown}
        className="h-7 w-32 text-right"
      />
    )
  }

  return (
    <button
      type="button"
      id={cellId}
      onClick={() => open(shown)}
      onKeyDown={handleButtonKeyDown}
      className={cn(
        "-mx-2 w-[calc(100%+1rem)] rounded-sm px-2 py-1 text-right tabular-nums outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        optimistic !== undefined && "opacity-60",
      )}
    >
      {shown === null ? "—" : currencyFormat.format(shown / 100)}
    </button>
  )
}
