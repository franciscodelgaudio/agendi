import Link from "@/components/shared/link"
import { ArrowRightIcon, LeafIcon, PiggyBankIcon, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UNIT_PAGE_PATHS } from "@/service/workspace/[workspaceId]/page-access"

function SetupNotice({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border border-primary/20 bg-primary/5 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:size-4">
        <Icon />
      </span>
      <div className="grid min-w-0 flex-1 basis-60">
        <span className="font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      {action && (
        <Button size="sm" nativeButton={false} render={<Link href={action.href} />}>
          {action.label}
          <ArrowRightIcon />
        </Button>
      )}
    </div>
  )
}

type Props = {
  workspaceId: string
  unitId: string
  missingServices: boolean
  missingWallet: boolean
  canManageServices: boolean
  canManageUnit: boolean
}

export function UnitSetupNotices({ workspaceId, unitId, missingServices, missingWallet, canManageServices, canManageUnit }: Props) {
  const base = `/workspace/${workspaceId}/unit/${unitId}`
  if (!missingServices && !missingWallet) return null

  return (
    <div className="grid gap-2">
      {missingWallet && (
        <SetupNotice
          icon={PiggyBankIcon}
          title={canManageUnit ? "Vincule uma carteira a esta unidade" : "Esta unidade não tem carteira"}
          description="Sem carteira, os atendimentos concluídos não viram valores a receber."
          action={canManageUnit ? { label: "Vincular carteira", href: `${base}${UNIT_PAGE_PATHS.cash_flow}` } : undefined}
        />
      )}
      {missingServices && (
        <SetupNotice
          icon={LeafIcon}
          title={canManageServices ? "Comece cadastrando os serviços" : "Nenhum serviço cadastrado"}
          description="Os agendamentos dependem dos serviços desta unidade, com duração e preço."
          action={canManageServices ? { label: "Cadastrar serviços", href: `${base}${UNIT_PAGE_PATHS.services}` } : undefined}
        />
      )}
    </div>
  )
}
