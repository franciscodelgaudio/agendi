"use client"

import { useActionState, useState } from "react"
import { EllipsisIcon, PencilIcon, ShieldCheckIcon, TrashIcon } from "lucide-react"
import { updateRolePermissionsAction, type RoleFormState } from "@/lib/actions/role"
import { UNIT_PAGES, WORKSPACE_PAGES, type UnitPage, type WorkspacePage } from "@/lib/page-access"
import { PERMISSIONS, type Permission } from "@/lib/permissions"
import { CreateRoleSheet, DeleteRoleDialog, RenameRoleSheet } from "@/components/role-actions"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { FieldError } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const permissionLabels: Record<Permission, string> = {
  "units.manage": "Gerenciar unidades",
  "services.manage": "Gerenciar serviços",
  "bookings.manage": "Gerenciar agendamentos",
  "appointments.manage": "Gerenciar atendimentos",
  "stock.manage": "Gerenciar estoque",
  "cash_flow.manage": "Gerenciar despesas e grupos do caixa",
  "team.manage": "Gerenciar a equipe e a remuneração",
  "users.manage": "Convidar, editar e remover usuários",
  "inbox.use": "Usar as Conversas",
  "channels.manage": "Gerenciar canais",
  "uras.manage": "Gerenciar URAs",
  "agenia.use": "Usar a AgenIA e ver os custos de IA",
  "workspace.manage": "Editar o workspace (nome, imagem e modelo da AgenIA)",
  attends: "Realiza atendimentos (aparece como massagista e ganha comissão sobre os próprios serviços)",
}

const workspacePageLabels: Record<WorkspacePage, string> = {
  home: "Início",
  units: "Unidades",
  calendar: "Calendário",
  cash_flow: "Caixa",
  team: "Equipe",
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

export type RoleView = {
  id: string
  name: string
  permissions: Permission[]
  pages: { workspace: WorkspacePage[]; unit: UnitPage[] }
}

const sections = [
  { field: "permissions", title: "Ações", items: PERMISSIONS, labels: permissionLabels },
  { field: "workspace", title: "Páginas do sistema", items: WORKSPACE_PAGES, labels: workspacePageLabels },
  { field: "unit", title: "Abas da unidade", items: UNIT_PAGES, labels: unitPageLabels },
] as const

function isChecked(role: RoleView, field: (typeof sections)[number]["field"], item: string) {
  const list: readonly string[] = field === "permissions" ? role.permissions : role.pages[field]
  return list.includes(item)
}

// Uma função por vez (escolhida no select), para a tabela caber no celular. As das outras
// funções ficam no formulário escondidas: o Salvar envia todas.
export function RolePermissionsForm({ workspaceId, roles }: { workspaceId: string; roles: RoleView[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [state, formAction, pending] = useActionState(
    (prev: RoleFormState, formData: FormData) => updateRolePermissionsAction(workspaceId, prev, formData),
    { error: null },
  )
  // Função criada ou excluída: cai na primeira se a escolhida não existe mais.
  const selected = roles.find((role) => role.id === selectedId) ?? roles[0] ?? null
  const roleItems = roles.map((role) => ({ value: role.id, label: role.name }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {selected ? (
          <div className="flex items-center gap-2">
            <Select items={roleItems} value={selected.id} onValueChange={(value) => setSelectedId(value as string)}>
              <SelectTrigger className="w-full sm:w-56" aria-label="Função">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label={`Ações da função ${selected.name}`} />}
              >
                <EllipsisIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => setRenameOpen(true)}>
                  <PencilIcon />
                  Renomear
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <TrashIcon />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div />
        )}
        <CreateRoleSheet workspaceId={workspaceId} />
      </div>

      {!selected ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheckIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhuma função criada</EmptyTitle>
            <EmptyDescription>
              Crie funções (ex.: Massagista, Recepcionista) e escolha o que cada uma pode ver e fazer. Administradores
              sempre têm acesso a tudo.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          {state.error && <FieldError>{state.error}</FieldError>}
          {roles.map((role) => (
            <div key={role.id} hidden={role.id !== selected.id} className="border">
              <input type="hidden" name="roleId" value={role.id} />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4">{role.name}</TableHead>
                    <TableHead className="w-0 px-4 text-center">Liberado</TableHead>
                  </TableRow>
                </TableHeader>
                {sections.map((section) => (
                  <TableBody key={section.field}>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={2} className="px-4 text-xs font-medium text-muted-foreground">
                        {section.title}
                      </TableCell>
                    </TableRow>
                    {section.items.map((item) => {
                      const label = (section.labels as Record<string, string>)[item]
                      const checked = isChecked(role, section.field, item)
                      return (
                        <TableRow key={item}>
                          <TableCell className="max-w-0 truncate px-4" title={label}>
                            {label}
                          </TableCell>
                          <TableCell className="px-4">
                            <div className="flex justify-center">
                              <Checkbox
                                key={String(checked)}
                                name={`${role.id}.${section.field}`}
                                value={item}
                                defaultChecked={checked}
                                aria-label={`${role.name}: ${section.title} · ${label}`}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                ))}
              </Table>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            Administradores têm acesso a tudo e são os únicos que criam funções e definem permissões.
          </p>
          <div>
            <Button type="submit" loading={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      )}

      {selected && (
        <>
          <RenameRoleSheet workspaceId={workspaceId} role={selected} open={renameOpen} onOpenChange={setRenameOpen} />
          <DeleteRoleDialog
            workspaceId={workspaceId}
            role={selected}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onDeleted={() => setSelectedId(null)}
          />
        </>
      )}
    </div>
  )
}
