"use client"

import { useActionState, useState, useTransition } from "react"
import { HandshakeIcon, PlusIcon, Trash2Icon, UnlinkIcon, XIcon } from "lucide-react"
import { createPartnerAction, deletePartnerAction, updatePartnerAction, type PartnerFormState } from "@/lib/actions/partner"
import { AmountInput } from "@/components/shared/amount-input"
import { money, percent, THRESHOLD_RULE_LABELS } from "@/components/workspace/[workspaceId]/cash-flow/partner-format"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  appliedShareBps,
  MAX_PARTNER_NAME_LENGTH,
  MAX_PARTNER_TIERS,
  type ThresholdRule,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/partner"
import { passOnCents } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/statement"
import type { UnitPartner } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/unit-cash-flow-store"

const NEW = "new"
const UNLINK = "unlink"

const RULE_ITEMS = [
  { value: "above", label: "Acima de", description: "O valor exato do limite fica na faixa de baixo." },
  { value: "from", label: "A partir de", description: "O valor exato do limite já entra na faixa de cima." },
]

type TierDraft = { key: number; thresholdCents: number | null; shareBps: number | null }

function draftsOf(partner: UnitPartner | null): TierDraft[] {
  if (!partner) return [{ key: 0, thresholdCents: 0, shareBps: null }]
  return partner.tiers.map((tier, index) => ({ key: index, ...tier }))
}

function completeTiers(drafts: TierDraft[]) {
  if (drafts.some((tier) => tier.thresholdCents === null || tier.shareBps === null)) return null
  return drafts.map((tier) => ({ thresholdCents: tier.thresholdCents!, shareBps: tier.shareBps! }))
}

function PartnerExample({ name, thresholdRule, drafts }: { name: string; thresholdRule: ThresholdRule; drafts: TierDraft[] }) {
  const tiers = completeTiers(drafts)
  if (!tiers) return null
  const highest = tiers[tiers.length - 1].thresholdCents
  const grossCents = highest > 0 ? highest + 200_000 : 1_000_000
  const shareBps = appliedShareBps({ thresholdRule, tiers }, grossCents)

  return (
    <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
      Exemplo: com {money(grossCents)} no período, {name.trim() || "o parceiro"} fica com{" "}
      <span className="font-medium text-foreground">{money(passOnCents(grossCents, shareBps))}</span> ({percent(shareBps)}) e você
      recebe <span className="font-medium text-foreground">{money(grossCents - passOnCents(grossCents, shareBps))}</span>.
    </p>
  )
}

export function PartnerFields({ partner }: { partner: UnitPartner | null }) {
  const [name, setName] = useState(partner?.name ?? "")
  const [thresholdRule, setThresholdRule] = useState<ThresholdRule>(partner?.thresholdRule ?? "above")
  const [drafts, setDrafts] = useState(() => draftsOf(partner))
  const [nextKey, setNextKey] = useState(drafts.length)

  function updateTier(key: number, change: Partial<TierDraft>) {
    setDrafts((current) => current.map((tier) => (tier.key === key ? { ...tier, ...change } : tier)))
  }

  function addTier() {
    setDrafts((current) => [...current, { key: nextKey, thresholdCents: null, shareBps: null }])
    setNextKey(nextKey + 1)
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor="partner-name">Nome</FieldLabel>
        <Input
          id="partner-name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Hotel Fasano"
          maxLength={MAX_PARTNER_NAME_LENGTH}
          required
        />
      </Field>
      <Field>
        <input type="hidden" name="thresholdRule" value={thresholdRule} />
        <FieldLabel htmlFor="partner-threshold-rule">O limite de cada faixa conta como</FieldLabel>
        <Select items={RULE_ITEMS} value={thresholdRule} onValueChange={(next) => setThresholdRule(next as ThresholdRule)}>
          <SelectTrigger id="partner-threshold-rule" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RULE_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldDescription>{RULE_ITEMS.find((item) => item.value === thresholdRule)?.description}</FieldDescription>
      </Field>
      <FieldSet>
        <FieldLegend variant="label">Faixas de repasse</FieldLegend>
        <FieldDescription>Quanto o parceiro fica, conforme o bruto do período. A faixa alcançada vale sobre o bruto inteiro.</FieldDescription>
        <div className="flex flex-col gap-2">
          {drafts.map((tier, index) => (
            <div key={tier.key} className="grid grid-cols-[1fr_6rem_2rem] items-center gap-2">
              {index === 0 ? (
                <>
                  <input type="hidden" name="tierThreshold" value="0" />
                  <span className="text-sm text-muted-foreground">Desde {money(0)}</span>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm text-muted-foreground">{THRESHOLD_RULE_LABELS[thresholdRule]}</span>
                  <AmountInput
                    name="tierThreshold"
                    aria-label={`Limite da faixa ${index + 1}`}
                    placeholder="R$ 0,00"
                    max={100_000_000}
                    value={tier.thresholdCents}
                    onValueChange={(thresholdCents) => updateTier(tier.key, { thresholdCents })}
                    required
                  />
                </div>
              )}
              <AmountInput
                mode="percent"
                name="tierShare"
                aria-label={`Percentual da faixa ${index + 1}`}
                placeholder="0,00%"
                max={9999}
                value={tier.shareBps}
                onValueChange={(shareBps) => updateTier(tier.key, { shareBps })}
                required
              />
              {index > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remover faixa ${index + 1}`}
                  onClick={() => setDrafts((current) => current.filter((item) => item.key !== tier.key))}
                >
                  <XIcon />
                </Button>
              )}
            </div>
          ))}
        </div>
        {drafts.length < MAX_PARTNER_TIERS && (
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addTier}>
            <PlusIcon />
            Adicionar faixa
          </Button>
        )}
      </FieldSet>
      <PartnerExample name={name} thresholdRule={thresholdRule} drafts={drafts} />
    </>
  )
}

function SourceField({ unlinked, value, onChange }: { unlinked: UnitPartner[]; value: string; onChange: (value: string) => void }) {
  const items = [{ value: NEW, label: "Novo parceiro" }, ...unlinked.map((partner) => ({ value: partner.id, label: partner.name }))]

  return (
    <Field>
      <FieldLabel htmlFor="partner-source">Parceiro</FieldLabel>
      <Select items={items} value={value} onValueChange={(next) => onChange(next as string)}>
        <SelectTrigger id="partner-source" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>Parceiros sem unidade podem ser vinculados de novo, com o histórico de fechamentos.</FieldDescription>
    </Field>
  )
}

export function DeletePartnerDialog({
  workspaceId,
  partner,
  open,
  onOpenChange,
  onDeleted,
}: {
  workspaceId: string
  partner: UnitPartner
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [deleting, startDelete] = useTransition()

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir parceiro?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{partner.name}</strong> e as faixas dele serão excluídos. Os atendimentos pendentes desta unidade passam a ser
            recebidos direto.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <Button
            variant="destructive"
            loading={deleting}
            onClick={() =>
              startDelete(async () => {
                const result = await deletePartnerAction(workspaceId, partner.id)
                setError(result.error)
                if (!result.error) onDeleted()
              })
            }
          >
            {deleting ? "Excluindo..." : "Excluir"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

type Props = { workspaceId: string; unitId: string; partner: UnitPartner | null; unlinked: UnitPartner[] }

export function UnitPartnerSheet({ workspaceId, unitId, partner, unlinked }: Props) {
  const [open, setOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [sourceId, setSourceId] = useState(partner?.id ?? NEW)
  const source = partner ?? unlinked.find((item) => item.id === sourceId) ?? null
  const [state, formAction, pending] = useActionState(async (prev: PartnerFormState, formData: FormData) => {
    const unlink = formData.get("intent") === UNLINK
    const next = source
      ? await updatePartnerAction(workspaceId, source.id, unlink ? null : unitId, prev, formData)
      : await createPartnerAction(workspaceId, unitId, prev, formData)
    if (!next.error) setOpen(false)
    return next
  }, { error: null })

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (next) setSourceId(partner?.id ?? NEW)
          setOpen(next)
        }}
      >
        <SheetTrigger render={<Button variant="outline" />}>
          <HandshakeIcon />
          {partner ? "Parceiro" : "Adicionar parceiro"}
        </SheetTrigger>
        <SheetContent>
          <form action={formAction} className="flex min-h-0 flex-1 flex-col">
            <SheetHeader>
              <SheetTitle>Parceiro da unidade</SheetTitle>
              <SheetDescription>
                Use quando a unidade funciona dentro de outro estabelecimento, que recebe dos clientes e te repassa por período,
                ficando com uma parte.
              </SheetDescription>
            </SheetHeader>
            <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
              {state.error && <FieldError>{state.error}</FieldError>}
              {!partner && unlinked.length > 0 && <SourceField unlinked={unlinked} value={sourceId} onChange={setSourceId} />}
              <PartnerFields key={source?.id ?? NEW} partner={source} />
            </FieldGroup>
            <SheetFooter>
              <Button type="submit" loading={pending}>
                {pending ? "Salvando..." : partner || !source ? "Salvar" : "Vincular"}
              </Button>
              {partner && (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="submit" name="intent" value={UNLINK} variant="outline" disabled={pending}>
                    <UnlinkIcon />
                    Desvincular
                  </Button>
                  <Button type="button" variant="ghost" className="text-destructive" disabled={pending} onClick={() => setDeleteOpen(true)}>
                    <Trash2Icon />
                    Excluir
                  </Button>
                </div>
              )}
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
      {partner && (
        <DeletePartnerDialog
          workspaceId={workspaceId}
          partner={partner}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={() => {
            setDeleteOpen(false)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
