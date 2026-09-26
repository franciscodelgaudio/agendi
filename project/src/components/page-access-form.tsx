"use client"

import { useActionState } from "react"
import { updatePageAccessAction, type PageAccessFormState } from "@/lib/actions/page-access"
import {
  RESTRICTED_ROLES,
  UNIT_PAGES,
  WORKSPACE_PAGES,
  type RestrictedRole,
  type UnitPage,
  type WorkspacePage,
} from "@/lib/page-access"
import { roleLabels } from "@/components/role-labels"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldError } from "@/components/ui/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const workspacePageLabels: Record<WorkspacePage, string> = {
  home: "Início",
  units: "Unidades",
  calendar: "Calendário",
  users: "Usuários",
}

const unitPageLabels: Record<UnitPage, string> = {
  overview: "Visão geral",
  services: "Serviços",
  calendar: "Calendário",
  appointments: "Atendimentos",
  stock: "Estoque",
  team: "Equipe",
  cash_flow: "Caixa",
}

type Visible = Record<RestrictedRole, { workspace: WorkspacePage[]; unit: UnitPage[] }>

export function PageAccessForm({ workspaceId, visible }: { workspaceId: string; visible: Visible }) {
  const [state, formAction, pending] = useActionState(
    (prev: PageAccessFormState, formData: FormData) => updatePageAccessAction(workspaceId, prev, formData),
    { error: null },
  )
  const sections = [
    { scope: "workspace" as const, title: "Sistema", pages: WORKSPACE_PAGES, labels: workspacePageLabels },
    { scope: "unit" as const, title: "Unidade", pages: UNIT_PAGES, labels: unitPageLabels },
  ]

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error && <FieldError>{state.error}</FieldError>}
      <div className="border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="px-4">Página</TableHead>
              {RESTRICTED_ROLES.map((role) => (
                <TableHead key={role} className="w-0 px-4 text-center whitespace-nowrap">
                  {roleLabels[role]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {sections.map((section) => (
            <TableBody key={section.scope}>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableCell colSpan={RESTRICTED_ROLES.length + 1} className="px-4 text-xs font-medium text-muted-foreground">
                  {section.title}
                </TableCell>
              </TableRow>
              {section.pages.map((page) => (
                <TableRow key={page}>
                  <TableCell className="max-w-0 truncate px-4">{(section.labels as Record<string, string>)[page]}</TableCell>
                  {RESTRICTED_ROLES.map((role) => {
                    const checked = (visible[role][section.scope] as string[]).includes(page)
                    return (
                      <TableCell key={role} className="px-4">
                        <div className="flex justify-center">
                          <Checkbox
                            key={String(checked)}
                            name={`${role}.${section.scope}`}
                            value={page}
                            defaultChecked={checked}
                            aria-label={`${roleLabels[role]}: ${section.title} · ${(section.labels as Record<string, string>)[page]}`}
                          />
                        </div>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          ))}
        </Table>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  )
}
