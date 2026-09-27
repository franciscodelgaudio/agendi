"use client"

import { useActionState, useState } from "react"
import { PencilIcon, WalletIcon } from "lucide-react"
import { updateOpeningBalanceAction, type OpeningBalanceState } from "@/lib/actions/opening-balance"
import type { OpeningBalance } from "@/lib/opening-balance"

import { OpeningBalanceFields } from "@/components/opening-balance-fields"
import { toDate } from "@/components/day-field"
import { currencyFormat } from "@/components/service-format"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { FieldError, FieldGroup } from "@/components/ui/field"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" })

// balanceCents: saldo inicial mais o líquido real desde o dia dele (null sem saldo inicial).
export function OpeningBalanceCard({
  workspaceId,
  unitId,
  openingBalance,
  balanceCents,
  canManage,
}: {
  workspaceId: string
  unitId: string
  openingBalance: OpeningBalance | null
  balanceCents: number | null
  canManage: boolean
}) {
  const [open, setOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [formKey, setFormKey] = useState(0)

  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="grid gap-1">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4">
              <WalletIcon />
            </span>
            <span className="font-medium">Saldo em caixa</span>
          </div>
          {openingBalance && balanceCents !== null ? (
            <>
              <div
                className={cn(
                  "text-2xl font-semibold tracking-tight tabular-nums",
                  balanceCents < 0 && "text-destructive",
                )}
              >
                {currencyFormat.format(balanceCents / 100)}
              </div>
              <div className="text-xs text-muted-foreground">
                {currencyFormat.format(openingBalance.amountCents / 100)} em{" "}
                {dayFormat.format(toDate(openingBalance.date))}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Saldo não informado</div>
          )}
        </div>
        {canManage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFormKey((key) => key + 1)
              setOpen(true)
            }}
          >
            <PencilIcon />
            {openingBalance ? "Editar saldo" : "Informar saldo"}
          </Button>
        )}
      </CardContent>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <OpeningBalanceForm
            key={formKey}
            workspaceId={workspaceId}
            unitId={unitId}
            openingBalance={openingBalance}
            onDone={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </Card>
  )
}

function OpeningBalanceForm({
  workspaceId,
  unitId,
  openingBalance,
  onDone,
}: {
  workspaceId: string
  unitId: string
  openingBalance: OpeningBalance | null
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: OpeningBalanceState, formData: FormData) => {
      const next = await updateOpeningBalanceAction(workspaceId, unitId, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Saldo em caixa</SheetTitle>
        <SheetDescription>Valor em caixa da unidade no dia escolhido.</SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <OpeningBalanceFields idPrefix={`opening-balance-${unitId}`} defaultValue={openingBalance} />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}
