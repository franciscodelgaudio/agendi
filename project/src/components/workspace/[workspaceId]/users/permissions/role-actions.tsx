"use client"

import { useActionState, useState, useTransition } from "react"
import { Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { createRoleAction, deleteRoleAction, renameRoleAction, type RoleFormState } from "@/lib/actions/role"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type RoleRef = { id: string; name: string }

export function CreateRoleDialog({
  workspaceId,
  roles,
  open,
  onOpenChange,
  onCreated,
}: {
  workspaceId: string
  roles: RoleRef[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (roleId: string) => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {open && (
          <CreateRoleForm
            workspaceId={workspaceId}
            roles={roles}
            onDone={(roleId) => {
              onOpenChange(false)
              onCreated(roleId)
            }}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function CreateRoleForm({
  workspaceId,
  roles,
  onDone,
}: {
  workspaceId: string
  roles: RoleRef[]
  onDone: (roleId: string) => void
}) {
  const [name, setName] = useState("")
  const [baseRoleId, setBaseRoleId] = useState("none")
  const baseItems = [{ value: "none", label: "Nenhuma (só Início)" }, ...roles.map((role) => ({ value: role.id, label: role.name }))]
  const [state, formAction, pending] = useActionState(
    async (prev: RoleFormState, formData: FormData) => {
      const next = await createRoleAction(workspaceId, prev, formData)
      if (!next.error && next.roleId) {
        toast.success(`Função “${name.trim()}” criada.`)
        onDone(next.roleId)
      }
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="contents">
      <AlertDialogHeader>
        <AlertDialogTitle>Nova função</AlertDialogTitle>
        <AlertDialogDescription>
          Dê um nome e escolha um ponto de partida. Você ajusta as permissões em seguida.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex flex-col gap-3.5">
        <NameField value={name} onChange={setName} error={state.error} />
        <Field>
          <FieldLabel htmlFor="role-base">Começar com as permissões de</FieldLabel>
          <Select name="baseRoleId" items={baseItems} value={baseRoleId} onValueChange={(value) => setBaseRoleId(value as string)}>
            <SelectTrigger id="role-base" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {baseItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
        <Button type="submit" loading={pending} disabled={!name.trim()}>
          {pending ? "Criando..." : "Criar função"}
        </Button>
      </AlertDialogFooter>
    </form>
  )
}

export function RenameRoleDialog({
  workspaceId,
  role,
  open,
  onOpenChange,
}: {
  workspaceId: string
  role: RoleRef
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {open && <RenameRoleForm workspaceId={workspaceId} role={role} onDone={() => onOpenChange(false)} />}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RenameRoleForm({ workspaceId, role, onDone }: { workspaceId: string; role: RoleRef; onDone: () => void }) {
  const [name, setName] = useState(role.name)
  const [state, formAction, pending] = useActionState(
    async (prev: RoleFormState, formData: FormData) => {
      const next = await renameRoleAction(workspaceId, role.id, prev, formData)
      if (!next.error) {
        toast.success("Função renomeada.")
        onDone()
      }
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="contents">
      <AlertDialogHeader>
        <AlertDialogTitle>Renomear função</AlertDialogTitle>
        <AlertDialogDescription>O novo nome aparece para todos os membros com essa função.</AlertDialogDescription>
      </AlertDialogHeader>
      <NameField value={name} onChange={setName} error={state.error} />
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
        <Button type="submit" loading={pending} disabled={!name.trim() || name.trim() === role.name}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </AlertDialogFooter>
    </form>
  )
}

function NameField({ value, onChange, error }: { value: string; onChange: (value: string) => void; error: string | null }) {
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor="role-name">Nome da função</FieldLabel>
      <Input
        id="role-name"
        name="name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ex.: Esteticista"
        maxLength={40}
        aria-invalid={!!error || undefined}
        autoFocus
        required
      />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}

function inUseLabel(members: number, invites: number) {
  const parts = [
    members > 0 && (members === 1 ? "1 membro" : `${members} membros`),
    invites > 0 && (invites === 1 ? "1 convite" : `${invites} convites`),
  ].filter(Boolean)
  return parts.join(" e ")
}

export function DeleteRoleDialog({
  workspaceId,
  role,
  open,
  onOpenChange,
  onDeleted,
}: {
  workspaceId: string
  role: RoleRef & { members: number; invites: number }
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inUse = role.members + role.invites > 0

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteRoleAction(workspaceId, role.id)
      setError(result.error)
      if (!result.error) {
        toast.success("Função excluída.")
        onOpenChange(false)
        onDeleted()
      }
    })
  }

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
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Excluir “{role.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {inUse
              ? `Há ${inUseLabel(role.members, role.invites)} com essa função. Troque a função deles na aba Usuários antes de excluir.`
              : "Nenhum membro usa essa função. Essa ação não pode ser desfeita."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDelete} loading={pending} disabled={inUse}>
            {pending ? "Excluindo..." : "Excluir"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
