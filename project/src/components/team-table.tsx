import { UserIcon } from "lucide-react"
import { canManageMembers, type WorkspaceRole } from "@/lib/member-role"
import { nextPayrollDate } from "@/lib/payroll"
import type { UnitTeamListItem, UnitTeamListQuery } from "@/lib/unit-team-list"
import { CodeCell, CodeHead } from "@/components/record-code"
import { SortableHead } from "@/components/sortable-head"
import { roleLabels } from "@/components/role-labels"
import { UnitMemberActions } from "@/components/unit-member-actions"
import { currencyFormat } from "@/components/service-format"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/initial-fallback"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const percentFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })

export type TeamRow = UnitTeamListItem & { unitId: string; unitName: string }

function payParts({ commissionPercent, salaryCents, bonuses }: UnitTeamListItem) {
  const parts: string[] = []
  if (commissionPercent !== null) parts.push(`${percentFormat.format(commissionPercent)}% de comissão`)
  if (salaryCents !== null) parts.push(`${currencyFormat.format(salaryCents / 100)}/mês`)
  if (bonuses.length > 0) parts.push(bonuses.length === 1 ? "1 bônus" : `${bonuses.length} bônus`)
  return parts
}

// Equipe de uma unidade ou de todas (showUnit). today: "2026-09-27", para o próximo pagamento.
// Sem rolagem horizontal: breakpoints somam a largura máxima das colunas visíveis (ex.: dois badges
// em Função, remuneração com comissão + salário + bônus); o nome ocupa o que sobrar.
export function TeamTable({
  workspaceId,
  role,
  rows,
  filters,
  pathname,
  today,
  showUnit = false,
  emptyText,
}: {
  workspaceId: string
  role: WorkspaceRole
  rows: TeamRow[]
  filters: Omit<UnitTeamListQuery, "page">
  pathname: string
  today: string
  showUnit?: boolean
  emptyText: string
}) {
  const canManage = canManageMembers(role)
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
              const isTherapist = member.role === "massage_therapist"
              // Só o proprietário define a remuneração de massagistas.
              const canEdit = canManage && (!isTherapist || role === "owner")
              const nextPay = nextPayrollDate(member, today)
              return (
                <TableRow key={`${member.id}:${member.unitId}`}>
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
                  {showUnit && <TableCell className="px-4 @max-4xl:hidden">{member.unitName}</TableCell>}
                  <TableCell className="px-4 @max-lg:hidden">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="secondary">{roleLabels[member.role]}</Badge>
                      {member.pending && <Badge variant="outline">Convite pendente</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums @max-6xl:hidden">
                    {payParts(member).join(" + ") || <span className="text-muted-foreground">Não definida</span>}
                  </TableCell>
                  <TableCell className="px-4 text-right tabular-nums @max-2xl:hidden">
                    {nextPay ? (
                      nextPay === today ? "Hoje" : dayFormat.format(new Date(nextPay))
                    ) : (
                      <span className="text-muted-foreground">Sem dia definido</span>
                    )}
                  </TableCell>
                  {canManage && (
                    <TableCell className="px-4 text-right">
                      {canEdit && (
                        <UnitMemberActions
                          workspaceId={workspaceId}
                          unitId={member.unitId}
                          unitName={member.unitName}
                          member={{
                            id: member.id,
                            label,
                            role: member.role,
                            startDate: member.startDate,
                            payDay: member.payDay,
                            commissionPercent: member.commissionPercent,
                            salaryCents: member.salaryCents,
                            bonuses: member.bonuses,
                          }}
                        />
                      )}
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
