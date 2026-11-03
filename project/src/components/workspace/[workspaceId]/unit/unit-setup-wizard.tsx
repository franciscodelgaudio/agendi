"use client"

import { useRef, useState, useTransition, type ReactNode } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { setupUnitAction } from "@/lib/actions/unit-setup"
import Link from "@/components/shared/link"
import { AmountInput } from "@/components/shared/amount-input"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OpeningBalanceFields } from "@/components/workspace/[workspaceId]/cash-flow/opening-balance-fields"
import { PartnerFields } from "@/components/workspace/[workspaceId]/unit/[unitId]/unit-partner-sheet"
import { UnitFields, type UnitFormOptions } from "@/components/workspace/[workspaceId]/unit/unit-fields"
import { cn } from "@/service/_shared/utils"

type Option = { id: string; name: string }

const STEPS = [
  {
    key: "wallet",
    title: "Onde entra o dinheiro desta unidade?",
    description: "Os atendimentos concluídos viram valores a receber nesta carteira. Sem ela, nada do que a unidade produz chega ao caixa.",
  },
  {
    key: "inventory",
    title: "Onde ficam os produtos desta unidade?",
    description: "Entradas, saídas e transferências são registradas no estoque que você escolher aqui.",
  },
  {
    key: "services",
    title: "O que esta unidade oferece?",
    description: "Cadastre pelo menos um serviço. A agenda usa a duração e o preço de cada um.",
  },
  {
    key: "partner",
    title: "Esta unidade repassa parte do faturamento?",
    description: "Use quando a unidade funciona no espaço de um parceiro que fica com uma porcentagem.",
  },
  { key: "unit", title: "Por fim, a unidade", description: "Nome, horário, onde se atende e quem atende." },
] as const

const stepIn = "animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out motion-reduce:slide-in-from-bottom-0"

function Choice({
  id,
  name,
  value,
  checked,
  onSelect,
  title,
  description,
  children,
}: {
  id: string
  name: string
  value: string
  checked: boolean
  onSelect: () => void
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className={cn("flex flex-col border p-4 transition-colors", checked && "border-primary bg-accent")}>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
        <input id={id} type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="mt-1 accent-primary" />
        <span className="grid gap-0.5">
          <span className="font-medium">{title}</span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </span>
      </label>
      {checked && children && <div className="grid gap-4 pt-4 pl-7">{children}</div>}
    </div>
  )
}

function OptionSelect({ id, name, label, options }: { id: string; name: string; label: string; options: Option[] }) {
  const items = options.map((option) => ({ value: option.id, label: option.name }))
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select name={name} items={items} defaultValue={items[0]?.value ?? null}>
        <SelectTrigger id={id} className="w-full">
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
    </Field>
  )
}

type Props = { workspaceId: string; wallets: Option[]; inventories: Option[]; options: UnitFormOptions; canPartner: boolean }

export function UnitSetupWizard({ workspaceId, wallets, inventories, options, canPartner }: Props) {
  const router = useRouter()
  const forms = useRef<(HTMLFormElement | null)[]>([])
  const [step, setStep] = useState(0)
  const [error, setError] = useState<{ step: number; message: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [walletMode, setWalletMode] = useState<"new" | "existing">("new")
  const [inventoryMode, setInventoryMode] = useState<"new" | "existing" | "none">("new")
  const [partnerMode, setPartnerMode] = useState<"none" | "yes">("none")
  const [serviceKeys, setServiceKeys] = useState([0])
  const last = STEPS.length - 1

  function go(next: number) {
    setStep(next)
    window.scrollTo({ top: 0 })
    document.querySelector("[data-slot=sidebar-inset]")?.scrollTo({ top: 0 })
  }

  function finish() {
    const [wallet, inventory, services, partner, unit] = forms.current.map((form) => new FormData(form ?? undefined))
    const prices = services.getAll("servicePrice")
    const durations = services.getAll("serviceDuration")
    const shares = partner.getAll("tierShare")
    const input = {
      wallet:
        walletMode === "new"
          ? {
              walletId: "new",
              walletName: wallet.get("walletName"),
              openingBalance: { amount: wallet.get("openingBalance"), date: wallet.get("openingBalanceDate") },
            }
          : { walletId: wallet.get("walletId") },
      inventory:
        inventoryMode === "existing"
          ? { inventoryId: inventory.get("inventoryId") }
          : { inventoryId: inventoryMode, inventoryName: inventory.get("inventoryName") },
      services: services.getAll("serviceName").map((name, index) => ({ name, duration: durations[index], price: prices[index] })),
      partner:
        partnerMode === "yes"
          ? {
              name: partner.get("name"),
              thresholdRule: partner.get("thresholdRule"),
              tiers: partner.getAll("tierThreshold").map((threshold, index) => ({ threshold, share: shares[index] })),
            }
          : null,
      unit: {
        name: unit.get("name"),
        imageUrl: unit.get("imageUrl"),
        stations: { types: unit.getAll("stationType"), quantities: unit.getAll("stationQuantity") },
        businessHours: { opensAt: unit.get("opensAt"), closesAt: unit.get("closesAt") },
        workspaceMemberIds: unit.getAll("workspaceMemberId"),
      },
    }

    startTransition(async () => {
      const result = await setupUnitAction(workspaceId, input)
      if (result.ok) {
        router.push(`/workspace/${workspaceId}/unit/${result.unitId}`)
        return
      }
      const failed = result.step ? STEPS.findIndex((item) => item.key === result.step) : step
      const where = result.index !== null ? ` (serviço ${result.index + 1})` : ""
      setError({ step: failed, message: `${result.error}${where}` })
      go(failed)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background px-6 py-6 md:px-10">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <Image src="/logo.svg" alt="Agendi" width={28} height={28} />
        <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          <div className="flex gap-1">
            {STEPS.map((item, index) => (
              <span
                key={item.key}
                className={cn("h-[3px] w-6 transition-colors duration-500 sm:w-8", index <= step ? "bg-primary" : "bg-border")}
              />
            ))}
          </div>
          <span className="hidden sm:inline">
            Nova unidade · Etapa {step + 1} de {STEPS.length}
          </span>
          <span className="sm:hidden">
            {step + 1}/{STEPS.length}
          </span>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/workspace/${workspaceId}/unit`} />}>
            Cancelar
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center pt-12 pb-16 md:items-center">
        {STEPS.map((item, index) => (
          <form
            key={item.key}
            ref={(form) => {
              forms.current[index] = form
            }}
            hidden={index !== step}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (index === last) finish()
              else go(index + 1)
            }}
            className={cn("flex w-full max-w-[560px] flex-col gap-8", index === step && stepIn)}
          >
            <div className="flex flex-col gap-2">
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => go(index - 1)}
                  className="mb-2 flex items-center gap-1 self-start text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ArrowLeftIcon className="size-3.5" />
                  Voltar
                </button>
              )}
              {item.key === "partner" && <span className="self-start bg-muted px-2 py-0.5 text-xs text-muted-foreground">Opcional</span>}
              <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-balance md:text-[32px]">{item.title}</h1>
              <p className="text-base text-pretty text-muted-foreground">{item.description}</p>
            </div>

            {error?.step === index && <FieldError>{error.message}</FieldError>}

            {item.key === "wallet" && (
              <div className="grid gap-3">
                <Choice
                  id="setup-wallet-new"
                  name="walletMode"
                  value="new"
                  checked={walletMode === "new"}
                  onSelect={() => setWalletMode("new")}
                  title="Criar uma carteira nova"
                  description="Quando a unidade tem conta ou caixa próprio"
                >
                  <Field>
                    <FieldLabel htmlFor="setup-wallet-name">Nome da carteira</FieldLabel>
                    <Input id="setup-wallet-name" name="walletName" placeholder="Caixa Centro" maxLength={40} />
                  </Field>
                  <OpeningBalanceFields idPrefix="setup-wallet" />
                </Choice>
                {wallets.length > 0 && (
                  <Choice
                    id="setup-wallet-existing"
                    name="walletMode"
                    value="existing"
                    checked={walletMode === "existing"}
                    onSelect={() => setWalletMode("existing")}
                    title="Usar uma carteira que já existe"
                    description="A unidade divide a carteira com outras"
                  >
                    <OptionSelect id="setup-wallet-id" name="walletId" label="Carteira" options={wallets} />
                  </Choice>
                )}
              </div>
            )}

            {item.key === "inventory" && (
              <div className="grid gap-3">
                <Choice
                  id="setup-inventory-new"
                  name="inventoryMode"
                  value="new"
                  checked={inventoryMode === "new"}
                  onSelect={() => setInventoryMode("new")}
                  title="Criar um estoque novo"
                  description="Quando a unidade guarda os próprios produtos"
                >
                  <Field>
                    <FieldLabel htmlFor="setup-inventory-name">Nome do estoque</FieldLabel>
                    <Input id="setup-inventory-name" name="inventoryName" placeholder="Estoque Centro" maxLength={40} />
                  </Field>
                </Choice>
                {inventories.length > 0 && (
                  <Choice
                    id="setup-inventory-existing"
                    name="inventoryMode"
                    value="existing"
                    checked={inventoryMode === "existing"}
                    onSelect={() => setInventoryMode("existing")}
                    title="Usar um estoque que já existe"
                    description="A unidade compartilha os produtos com outra"
                  >
                    <OptionSelect id="setup-inventory-id" name="inventoryId" label="Estoque" options={inventories} />
                  </Choice>
                )}
                <Choice
                  id="setup-inventory-none"
                  name="inventoryMode"
                  value="none"
                  checked={inventoryMode === "none"}
                  onSelect={() => setInventoryMode("none")}
                  title="Não controlo estoque nesta unidade"
                  description="Dá para ativar depois, na unidade"
                />
              </div>
            )}

            {item.key === "services" && (
              <div className="grid gap-3">
                {serviceKeys.map((key, position) => (
                  <div key={key} className="grid grid-cols-2 items-end gap-3 border p-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_2rem]">
                    <Field className="col-span-2 sm:col-span-1">
                      <FieldLabel htmlFor={`setup-service-${key}-name`}>Serviço</FieldLabel>
                      <Input id={`setup-service-${key}-name`} name="serviceName" placeholder="Massagem relaxante" maxLength={80} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`setup-service-${key}-duration`}>Minutos</FieldLabel>
                      <Input
                        id={`setup-service-${key}-duration`}
                        name="serviceDuration"
                        type="number"
                        inputMode="numeric"
                        min={5}
                        max={720}
                        step={5}
                        defaultValue={60}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`setup-service-${key}-price`}>Preço</FieldLabel>
                      <AmountInput id={`setup-service-${key}-price`} name="servicePrice" max={100_000_000} placeholder="R$ 0,00" />
                    </Field>
                    {serviceKeys.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remover serviço ${position + 1}`}
                        className="col-span-2 justify-self-end sm:col-span-1"
                        onClick={() => setServiceKeys((current) => current.filter((item) => item !== key))}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="w-fit"
                  onClick={() => setServiceKeys((current) => [...current, Math.max(...current) + 1])}
                >
                  <PlusIcon />
                  Adicionar serviço
                </Button>
              </div>
            )}

            {item.key === "partner" && (
              <div className="grid gap-3">
                <Choice
                  id="setup-partner-none"
                  name="partnerMode"
                  value="none"
                  checked={partnerMode === "none"}
                  onSelect={() => setPartnerMode("none")}
                  title="Não, esta unidade não repassa"
                  description="Cada atendimento recebido entra direto na carteira"
                />
                {canPartner ? (
                <Choice
                  id="setup-partner-yes"
                  name="partnerMode"
                  value="yes"
                  checked={partnerMode === "yes"}
                  onSelect={() => setPartnerMode("yes")}
                  title="Sim, repassa para um parceiro"
                  description="O parceiro fica com a porcentagem da faixa atingida no período"
                >
                  <PartnerFields partner={null} />
                </Choice>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Seu acesso não permite cadastrar parceiros. Quem tiver essa permissão pode vincular um depois.
                  </p>
                )}
              </div>
            )}

            {item.key === "unit" && (
              <div className="grid gap-6">
                <UnitFields idPrefix="setup-unit" workspaceId={workspaceId} options={options} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="lg" loading={index === last && pending}>
                {index === last ? (
                  <>
                    Criar unidade
                    <CheckIcon data-icon="inline-end" />
                  </>
                ) : (
                  <>
                    Continuar
                    <ArrowRightIcon data-icon="inline-end" />
                  </>
                )}
              </Button>
              {item.key === "partner" && partnerMode === "yes" && (
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setPartnerMode("none")
                    go(index + 1)
                  }}
                >
                  Pular esta etapa
                </Button>
              )}
              {index === last && <span className="text-xs text-muted-foreground">Nada é salvo até você criar a unidade.</span>}
            </div>
          </form>
        ))}
      </main>
    </div>
  )
}
