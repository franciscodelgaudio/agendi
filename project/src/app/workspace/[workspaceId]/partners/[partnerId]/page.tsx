import { redirect } from "next/navigation"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { loadPartnerPage } from "@/service/workspace/[workspaceId]/partners/partner-page-store"
import {
  parseStatementListQuery,
  pendingByDayPipeline,
  pendingReceivablesPipeline,
  RECEIVABLE_PAGE_SIZE,
  statementListPipeline,
  type PendingDay,
  type PendingReceivablePage,
  type StatementListPage,
} from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-list"
import { findPartnerPeriods } from "@/service/workspace/[workspaceId]/unit/[unitId]/cash-flow/receivable-store"
import { PageHeader } from "@/components/shared/page-header"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { QuerySelect } from "@/components/shared/query-select"
import { PendingCard } from "@/components/workspace/[workspaceId]/cash-flow/money-path"
import { ReconcileStatementSheet } from "@/components/workspace/[workspaceId]/cash-flow/statement-sheets"
import { StatementTable } from "@/components/workspace/[workspaceId]/cash-flow/statement-table"
import { PartnerImage } from "@/components/workspace/[workspaceId]/partners/partner-image"
import { PartnerActions } from "@/components/workspace/[workspaceId]/partners/partner-sheets"
import { Receivable } from "@/models/Receivable"
import { Statement } from "@/models/Statement"

const NO_PENDING: PendingReceivablePage = { rows: [], total: 0, totalCents: 0 }
const NO_STATEMENTS: StatementListPage = { rows: [], total: 0 }

function plural(count: number) {
  return count === 1 ? "1 atendimento" : `${count} atendimentos`
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{children}</p>
}

export default async function PartnerPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/partners/[partnerId]">) {
  const { workspaceId, partnerId } = await params
  const { q, check, page } = parseStatementListQuery(await searchParams)
  const listQuery = { q, check }
  const { actor, partner, freeUnits } = await loadPartnerPage(workspaceId, partnerId)
  const { unit } = partner
  const walletId = unit?.walletId ?? null
  const reconciles = can(actor, "cash_flow.manage") && !!unit && !!walletId

  const [[statements = NO_STATEMENTS], [pending = NO_PENDING], days, periods] = await Promise.all([
    Statement.aggregate<StatementListPage>(statementListPipeline({ partnerId: partner.id }, page, { q, check })),
    unit && walletId ? Receivable.aggregate<PendingReceivablePage>(pendingReceivablesPipeline(walletId, unit.id, 1)) : [],
    reconciles ? Receivable.aggregate<PendingDay>(pendingByDayPipeline(walletId!, unit!.id)) : [],
    findPartnerPeriods(reconciles ? [partner.id] : []),
  ])

  const base = `/workspace/${workspaceId}`
  const pathname = `${base}/partners/${partner.id}`
  const pages = Math.ceil(statements.total / RECEIVABLE_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(Object.entries({ ...listQuery, page: String(pages) }).filter(([, v]) => v))
    redirect(`${pathname}?${params}`)
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <PartnerImage name={partner.name} imageUrl={partner.imageUrl} className="size-9 shrink-0 rounded-md" />
            <span className="truncate">{partner.name}</span>
          </span>
        }
        back={{ href: `${base}/partners`, label: "Voltar aos parceiros" }}
        actions={
          can(actor, "partners.manage") && (
            <PartnerActions workspaceId={workspaceId} partner={partner} units={freeUnits} deletedHref={`${base}/partners`} />
          )
        }
      />

      {!unit ? (
        <Notice>Este parceiro não está vinculado a nenhuma unidade. O histórico de repasses continua abaixo.</Notice>
      ) : !walletId ? (
        <Notice>
          {unit.name} não tem carteira. Vincule uma carteira no caixa da unidade para que os atendimentos fiquem pendentes de conferência.
        </Notice>
      ) : (
        <div className="flex max-w-xl">
          <PendingCard
            label={`Com ${partner.name}`}
            cents={pending.totalCents}
            hint={pending.total > 0 ? `${plural(pending.total)} ainda não conferidos` : "Nada pendente de conferência."}
          >
            {reconciles && (
              <div>
                <ReconcileStatementSheet
                  workspaceId={workspaceId}
                  partners={[{ ...partner, unitId: unit.id, periods: periods[partner.id] ?? [] }]}
                  days={days}
                />
              </div>
            )}
          </PendingCard>
        </div>
      )}

      <section aria-labelledby="statements-title" className="flex flex-col gap-3">
        <h3 id="statements-title" className="font-semibold">
          Repasses conferidos
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <ListSearch query={listQuery} placeholder="Buscar repasse..." />
          <QuerySelect
            query={listQuery}
            field="check"
            label="Conferência"
            items={[
              { value: "all", label: "Todas as conferências" },
              { value: "match", label: "Bateu" },
              { value: "diff", label: "Com diferença" },
            ]}
          />
        </div>
        <StatementTable
          workspaceId={workspaceId}
          statements={statements.rows}
          showPartner={false}
          canManage={can(actor, "cash_flow.manage")}
        />
        <ListPagination
          query={listQuery}
          page={page}
          pageSize={RECEIVABLE_PAGE_SIZE}
          total={statements.total}
          pathname={pathname}
          itemLabel="repasses"
        />
      </section>
    </div>
  )
}
