"use client"

import { useState, useTransition } from "react"
import { CheckIcon, EllipsisIcon, PencilIcon, PlusIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { updateRolePermissionsAction } from "@/lib/actions/role"
import { UNIT_PAGES, WORKSPACE_PAGES, type UnitPage, type WorkspacePage } from "@/service/workspace/[workspaceId]/page-access"
import { PERMISSIONS, type Permission } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { CreateRoleDialog, DeleteRoleDialog, RenameRoleDialog } from "@/components/workspace/[workspaceId]/users/permissions/role-actions"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { cn } from "@/service/_shared/utils"

type Action = Exclude<Permission, "attends">

const permissionLabels: Record<Action, string> = {
  "units.manage": "Gerenciar unidades",
  "services.manage": "Gerenciar serviços",
  "bookings.manage": "Gerenciar agendamentos",
  "appointments.manage": "Gerenciar atendimentos",
  "customers.manage": "Cadastrar, editar e remover clientes",
  "stock.manage": "Gerenciar estoque",
  "stock.transfer": "Transferir produtos entre inventários",
  "cash_flow.manage": "Gerenciar carteiras e transações do caixa",
  "users.manage": "Convidar, editar e remover usuários",
  "workspace.manage": "Editar o workspace (nome e imagem)",
}

const actionGroups: { name: string; actions: Action[] }[] = [
  { name: "Agenda", actions: ["bookings.manage", "appointments.manage"] },
  { name: "Clientes", actions: ["customers.manage"] },
  { name: "Serviços", actions: ["services.manage"] },
  { name: "Unidades", actions: ["units.manage"] },
  { name: "Caixa", actions: ["cash_flow.manage"] },
  { name: "Estoque", actions: ["stock.manage", "stock.transfer"] },
  { name: "Usuários", actions: ["users.manage"] },
  { name: "Workspace", actions: ["workspace.manage"] },
]

const ACTIONS = PERMISSIONS.filter((item): item is Action => item !== "attends")

const workspacePageLabels: Record<WorkspacePage, string> = {
  home: "Início",
  units: "Unidades",
  calendar: "Agenda",
  customers: "Clientes",
  services: "Serviços",
  cash_flow: "Caixa",
  stock: "Estoque",
  users: "Usuários",
}

const unitPageLabels: Record<UnitPage, string> = {
  overview: "Visão geral",
  calendar: "Agenda",
  appointments: "Atendimentos",
}

const TOTAL = ACTIONS.length + WORKSPACE_PAGES.length + UNIT_PAGES.length

export type RoleView = {
  id: string
  name: string
  permissions: Permission[]
  pages: { workspace: WorkspacePage[]; unit: UnitPage[] }
  members: number
  invites: number
}

type Settings = { permissions: Permission[]; workspace: WorkspacePage[]; unit: UnitPage[] }

function savedSettings(role: RoleView): Settings {
  return { permissions: role.permissions, workspace: role.pages.workspace, unit: role.pages.unit }
}

function sameSettings(a: Settings, b: Settings) {
  const key = (s: Settings) => [s.permissions, s.workspace, s.unit].map((list) => [...list].sort().join(",")).join("|")
  return key(a) === key(b)
}

function toggle<T>(list: T[], item: T) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
}

function membersLabel(n: number) {
  return n === 0 ? "Nenhum membro" : n === 1 ? "1 membro" : `${n} membros`
}

export function RolePermissionsForm({ workspaceId, roles }: { workspaceId: string; roles: RoleView[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null)
  const [drafts, setDrafts] = useState<Record<string, Settings>>({})
  const [dialog, setDialog] = useState<"create" | "rename" | "delete" | null>(null)
  const [saving, startSaving] = useTransition()

  const selected = roles.find((role) => role.id === selectedId) ?? roles[0] ?? null
  const settingsOf = (role: RoleView) => drafts[role.id] ?? savedSettings(role)
  const isDirty = (role: RoleView) => !!drafts[role.id] && !sameSettings(drafts[role.id], savedSettings(role))
  const dirtyRoles = roles.filter(isDirty)

  function edit(fn: (settings: Settings) => Settings) {
    if (!selected) return
    setDrafts((current) => ({ ...current, [selected.id]: fn(current[selected.id] ?? savedSettings(selected)) }))
  }

  function save() {
    const formData = new FormData()
    for (const role of roles) {
      const settings = settingsOf(role)
      formData.append("roleId", role.id)
      settings.permissions.forEach((item) => formData.append(`${role.id}.permissions`, item))
      settings.workspace.forEach((item) => formData.append(`${role.id}.workspace`, item))
      settings.unit.forEach((item) => formData.append(`${role.id}.unit`, item))
    }
    startSaving(async () => {
      const result = await updateRolePermissionsAction(workspaceId, { error: null }, formData)
      if (result.error) {
        toast.error(result.error)
        return
      }
      setDrafts({})
      toast.success("Permissões salvas.")
    })
  }

  const dialogs = (
    <>
      <CreateRoleDialog
        workspaceId={workspaceId}
        roles={roles}
        open={dialog === "create"}
        onOpenChange={(open) => setDialog(open ? "create" : null)}
        onCreated={setSelectedId}
      />
      {selected && (
        <>
          <RenameRoleDialog
            workspaceId={workspaceId}
            role={selected}
            open={dialog === "rename"}
            onOpenChange={(open) => setDialog(open ? "rename" : null)}
          />
          <DeleteRoleDialog
            workspaceId={workspaceId}
            role={selected}
            open={dialog === "delete"}
            onOpenChange={(open) => setDialog(open ? "delete" : null)}
            onDeleted={() => setSelectedId(null)}
          />
        </>
      )}
    </>
  )

  if (!selected) {
    return (
      <>
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheckIcon />
            </EmptyMedia>
            <EmptyTitle>Nenhuma função criada</EmptyTitle>
            <EmptyDescription>
              Crie funções (ex.: Terapeuta, Recepção) e escolha o que cada uma pode ver e fazer. Administradores sempre
              têm acesso a tudo.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setDialog("create")}>
              <PlusIcon data-icon="inline-start" />
              Nova função
            </Button>
          </EmptyContent>
        </Empty>
        {dialogs}
      </>
    )
  }

  const current = settingsOf(selected)
  const actions = current.permissions.filter((item) => item !== "attends")
  const attends = current.permissions.includes("attends")
  const granted = actions.length + current.workspace.length + current.unit.length

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate text-xl font-semibold tracking-tight">{selected.name}</h3>
          <span className="text-sm text-muted-foreground tabular-nums">
            {membersLabel(selected.members)} · {granted} de {TOTAL} permissões liberadas
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Ações da função" />}>
            <EllipsisIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-44">
            <DropdownMenuItem onClick={() => setDialog("rename")}>
              <PencilIcon />
              Renomear
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
              <Trash2Icon />
              Excluir função
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <aside className="flex max-w-full flex-[1_1_220px] flex-col border bg-card">
          <div className="flex items-center justify-between gap-2 border-b py-2 pr-2 pl-4">
            <span className="text-sm font-medium">Funções</span>
            <Button variant="ghost" size="sm" onClick={() => setDialog("create")}>
              <PlusIcon data-icon="inline-start" />
              Nova função
            </Button>
          </div>
          <div className="flex flex-col p-1">
            {roles.map((role) => {
              const active = role.id === selected.id
              return (
                <button
                  key={role.id}
                  type="button"
                  aria-current={active || undefined}
                  onClick={() => setSelectedId(role.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted",
                    active && "bg-muted",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className={cn("truncate text-sm", active ? "font-semibold" : "font-normal")}>{role.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{membersLabel(role.members)}</span>
                  </span>
                  {isDirty(role) && (
                    <span title="Alterações não salvas" className="size-2 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              )
            })}
          </div>
        </aside>

        <section className="flex min-w-0 flex-[999_1_480px] flex-col gap-4">
          <div className="flex items-center gap-4 border bg-card px-4 py-3.5">
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">Realiza atendimentos</span>
              <span className="text-[13px] text-pretty text-muted-foreground">
                Aparece como profissional na agenda e ganha comissão sobre os próprios serviços.
              </span>
            </span>
            <PermissionSwitch
              label="Realiza atendimentos"
              checked={attends}
              onCheckedChange={() => edit((s) => ({ ...s, permissions: toggle(s.permissions, "attends") }))}
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Páginas que pode acessar</span>
              <div className="ml-auto flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    edit(() => ({
                      permissions: attends ? ["attends", ...ACTIONS] : [...ACTIONS],
                      workspace: [...WORKSPACE_PAGES],
                      unit: [...UNIT_PAGES],
                    }))
                  }
                >
                  Liberar tudo
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    edit(() => ({ permissions: attends ? ["attends"] : [], workspace: ["home"], unit: [] }))
                  }
                >
                  Remover tudo
                </Button>
              </div>
            </div>
            <ChipGroup
              title="Páginas do sistema"
              items={WORKSPACE_PAGES}
              labels={workspacePageLabels}
              selected={current.workspace}
              isLocked={(page) => current.workspace.length === 1 && current.workspace.includes(page)}
              onToggle={(page) => edit((s) => ({ ...s, workspace: toggle(s.workspace, page) }))}
            />
            <ChipGroup
              title="Abas da unidade"
              items={UNIT_PAGES}
              labels={unitPageLabels}
              selected={current.unit}
              onToggle={(page) => edit((s) => ({ ...s, unit: toggle(s.unit, page) }))}
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-sm font-medium">O que pode fazer</span>
            <div className="flex flex-col overflow-hidden border bg-card">
              {actionGroups.map((group, i) => (
                <div key={group.name} className={cn("flex flex-col gap-0.5 px-4 pt-3 pb-2.5", i > 0 && "border-t")}>
                  <span className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.name}</span>
                  {group.actions.map((action) => (
                    <div key={action} className="flex items-center gap-4 p-2 text-sm">
                      <span className="flex-1 text-pretty">{permissionLabels[action]}</span>
                      <PermissionSwitch
                        label={permissionLabels[action]}
                        checked={current.permissions.includes(action)}
                        onCheckedChange={() => edit((s) => ({ ...s, permissions: toggle(s.permissions, action) }))}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Administradores têm acesso a tudo e são os únicos que criam funções e definem permissões.
          </p>

          {dirtyRoles.length > 0 && (
            <div className="sticky bottom-[calc(var(--bottom-nav-height)+1rem)] z-5 flex flex-wrap items-center justify-between gap-3 bg-foreground py-2.5 pr-3 pl-4 text-background shadow-[0_8px_24px_rgb(0_0_0/0.18)]">
              <span className="text-sm">
                {dirtyRoles.length === 1
                  ? `Alterações não salvas em ${dirtyRoles[0].name}`
                  : `Alterações não salvas em ${dirtyRoles.length} funções`}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" className="text-background" disabled={saving} onClick={() => setDrafts({})}>
                  Descartar
                </Button>
                <Button variant="secondary" loading={saving} onClick={save}>
                  {!saving && <CheckIcon data-icon="inline-start" />}
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
      {dialogs}
    </div>
  )
}

function ChipGroup<T extends string>({
  title,
  items,
  labels,
  selected,
  isLocked,
  onToggle,
}: {
  title: string
  items: readonly T[]
  labels: Record<T, string>
  selected: T[]
  isLocked?: (item: T) => boolean
  onToggle: (item: T) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const on = selected.includes(item)
          return (
            <button
              key={item}
              type="button"
              aria-pressed={on}
              disabled={isLocked?.(item)}
              title={isLocked?.(item) ? "Deixe ao menos uma página do sistema liberada" : undefined}
              onClick={() => onToggle(item)}
              className={cn(
                "flex h-9 items-center gap-1.5 border px-3 text-sm disabled:cursor-not-allowed",
                on
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-dashed text-muted-foreground hover:border-foreground hover:text-foreground",
              )}
            >
              {on && <CheckIcon className="size-3.5 text-primary" />}
              {labels[item]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PermissionSwitch({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onCheckedChange}
      className={cn(
        "flex h-[22px] w-10 shrink-0 items-center p-[3px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        checked
          ? "justify-end bg-primary"
          : "justify-start bg-[color-mix(in_oklch,var(--foreground)_18%,var(--muted))] hover:bg-[color-mix(in_oklch,var(--foreground)_28%,var(--muted))]",
      )}
    >
      <span className={cn("size-4", checked ? "bg-primary-foreground" : "bg-card")} />
    </button>
  )
}
