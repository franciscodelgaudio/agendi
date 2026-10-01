import type { ReactNode } from "react"
import { UserIcon } from "lucide-react"
import { cn } from "cn"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { nextPayrollDate } from "@/service/workspace/[workspaceId]/unit/[unitId]/team/payroll"
import type { UnitTeamListItem, UnitTeamListQuery } from "@/service/workspace/[workspaceId]/team/unit-team-list"
import { CodeCell, CodeHead } from "@/components/shared/record-code"
import { SortableHead } from "@/components/shared/sortable-head"
import { UnitMemberActions, type UnitMemberLink } from "@/components/workspace/[workspaceId]/shared/team/unit-member-actions"
import { currencyFormat } from "@/components/shared/service-format"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/shared/initial-fallback"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const percentFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })

// Uma linha por pessoa; a remuneração é por unidade (links, na ordem das unidades). Os campos de
// remuneração de UnitTeamListItem servem só aos filtros.
export type TeamRow = UnitTeamListItem & { links: UnitMemberLink[] }

function payParts({ commissionPercent, salaryCents, bonuses }: UnitMemberLink) {
  const parts: string[] = []
  if (commissionPercent !== null) parts.push(`${percentFormat.format(commissionPercent)}% de comissão`)
  if (salaryCents !== null) parts.push(`${currencyFormat.format(salaryCents / 100)}/mês`)
  if (bonuses.length > 0) parts.push(bonuses.length === 1 ? "1 bônus" : `${bonuses.length} bônus`)
  return parts
}

// Equipe de uma unidade ou de todas (showUnit). today: "2026-09-27", para o próximo pagamento.
// Quem está em várias unidades tem uma linha de Unidade, Remuneração e Próximo pagamento para cada uma.
// Sem rolagem horizontal: breakpoints somam a largura máxima das colunas visíveis (ex.: dois badges
// em Função, remuneração com comissão + salário + bônus); o nome ocupa o que sobrar.
export function TeamTable({
  workspaceId,
  actor,
  rows,
  filters,
  pathname,
  today,
  showUnit = false,
  emptyText,
}: {
  workspaceId: string
  actor: Actor
  rows: TeamRow[]
  filters: Omit<UnitTeamListQuery, "page">
  pathname: string
  today: string
  showUnit?: boolean
  emptyText: string
}) {
  const canManage = can(actor, "team.manage")
  const columns = 5 + (showUnit ? 1 : 0) + (canManage ? 1 : 0)
  return (
    <div data-tour="team-table" className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <CodeHead className="@max-7xl:hidden" />
            {/* Só há ordenação por nome; o sort fixo alimenta o cabeçalho e é ignorado na leitura. */}
            <SortableHead
              field="name"
              label="Nome"
              icon={UserIcon}
              query={{ ...filters, sort: "name" }}
              pathname={pathname}
              className="w-full"
            />
            {showUnit && <TableHead className="px-4 @max-4xl:hidden">Unidade</TableHead>}
            <TableHead className="px-4 @max-lg:hidden">Função</TableHead>
            <TableHead className="px-4 text-right @max-6xl:hidden">Remuneração</TableHead>
            <TableHead className="px-4 text-right @max-2xl:hidden">Próximo pagamento</TableHead>
            {canManage && <TableHead className="w-0 px-4 text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns} className="px-4 py-6 text-center text-muted-foreground">
                {emptyText}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((member) => {
              const label = member.name ?? member.email
              return (
                <TableRow key={member.id}>
                  <CodeCell id={member.id} className="@max-7xl:hidden" />
                  <TableCell className="max-w-0 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        {member.image && <AvatarImage src={member.image} alt={label} />}
                        <InitialFallback name={label} />
                      </Avatar>
                      <div className="grid min-w-0">
                        <span className="truncate font-medium">{label}</span>
                        {member.name && <span className="truncate text-xs text-muted-foreground">{member.email}</span>}
                      </div>
                    </div>
                  </TableCell>
                  {showUnit && (
                    <TableCell className="px-4 @max-4xl:hidden">
                      <UnitLines links={member.links}>{(link) => link.unitName}</UnitLines>
                    </TableCell>
                  )}
                  <TableCell className="px-4 @max-lg:hidden">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary">{member.roleName ?? "Sem função"}</Badge>
                      {member.pending && <Badge variant="outline">Convite pendente</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums @max-6xl:hidden">
                    <UnitLines links={member.links} className="justify-end">
                      {(link) => payParts(link).join(" + ") || <span className="text-muted-foreground">Não definida</span>}
                    </UnitLines>
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums @max-2xl:hidden">
                    <UnitLines links={member.links} className="justify-end">
                      {(link) => {
                        const nextPay = nextPayrollDate(link, today)
                        if (!nextPay) return <span className="text-muted-foreground">Sem dia definido</span>
                        return nextPay === today ? "Hoje" : dayFormat.format(new Date(nextPay))
                      }}
                    </UnitLines>
                  </TableCell>
                  {canManage && (
                    <TableCell className="px-4 text-right">
                      <UnitMemberActions
                        workspaceId={workspaceId}
                        member={{ id: member.id, label }}
                        links={member.links}
                      />
                    </TableCell>
                  )}
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}

// Uma linha por unidade, com a mesma altura em todas as colunas para que fiquem alinhadas.
function UnitLines({
  links,
  className,
  children,
}: {
  links: UnitMemberLink[]
  className?: string
  children: (link: UnitMemberLink) => ReactNode
}) {
  return (
    <div className="grid gap-1">
      {links.map((link) => (
        <div key={link.unitId} className={cn("flex h-5 items-center whitespace-nowrap", className)}>
          {children(link)}
        </div>
      ))}
    </div>
  )
}
