"use client"

import { useActionState, useState, useTransition } from "react"
import {
  CircleCheckIcon,
  EllipsisVerticalIcon,
  LockIcon,
  MailIcon,
  MailXIcon,
  PencilIcon,
  ShieldCheckIcon,
  UserIcon,
  UserMinusIcon,
} from "lucide-react"
import { toast } from "sonner"
import {
  cancelInviteAction,
  removeMemberAction,
  updateInviteAction,
  updateMemberAction,
  type MemberFormState,
} from "@/lib/actions/member"

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
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { InitialFallback } from "@/components/shared/initial-fallback"
import { RoleSelect, type RoleChoices } from "@/components/workspace/[workspaceId]/users/member-fields"
import { INVITE_STATUS_LABELS } from "@/components/workspace/[workspaceId]/users/user-labels"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export type ManagedMember = {
  id: string
  email: string
  name: string | null
  image: string | null
  roleId: string
  status: "active" | "pending" | "expired"
  locked: boolean
  lastAdmin: boolean
}

export function MemberActions({
  workspaceId,
  workspaceName,
  member,
  choices,
}: {
  workspaceId: string
  workspaceName: string
  member: ManagedMember
  choices: RoleChoices
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [editKey, setEditKey] = useState(0)
  const [cancelling, startCancel] = useTransition()
  const label = member.name ?? member.email
  const invite = member.status !== "active"

  function cancelInvite() {
    startCancel(async () => {
      const result = await cancelInviteAction(workspaceId, member.id)
      if (result.error) toast.error(result.error)
      else toast.success("Convite cancelado.")
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${label}`} loading={cancelling} />}
        >
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuItem
            className="whitespace-nowrap"
            onClick={() => {
              setEditKey((k) => k + 1)
              setEditOpen(true)
            }}
          >
            <PencilIcon />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {invite ? (
            <DropdownMenuItem
              variant="destructive"
              className="whitespace-nowrap"
              disabled={member.locked}
              onClick={cancelInvite}
            >
              <MailXIcon />
              Cancelar convite
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              className="whitespace-nowrap"
              disabled={member.locked || member.lastAdmin}
              onClick={() => setRemoveOpen(true)}
            >
              <UserMinusIcon />
              Remover
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <ManageMemberForm
            key={editKey}
            workspaceId={workspaceId}
            member={member}
            choices={choices}
            onDone={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {!invite && (
        <RemoveMemberDialog
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          member={member}
          open={removeOpen}
          onOpenChange={setRemoveOpen}
        />
      )}
    </>
  )
}

function SectionLabel({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Icon className="size-4" />
      <span className="whitespace-nowrap">{children}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

function ManageMemberForm({
  workspaceId,
  member,
  choices,
  onDone,
}: {
  workspaceId: string
  member: ManagedMember
  choices: RoleChoices
  onDone: () => void
}) {
  const invite = member.status !== "active"
  const [roleId, setRoleId] = useState<string | null>(member.roleId)
  const [state, formAction, pending] = useActionState(
    async (prev: MemberFormState, formData: FormData) => {
      const update = invite ? updateInviteAction : updateMemberAction
      const next = await update(workspaceId, member.id, prev, formData)
      if (!next.error) {
        toast.success(invite ? "Convite atualizado." : "Usuário atualizado.")
        onDone()
      }
      return next
    },
    { error: null },
  )

  const role = choices.roles.find((item) => item.id === roleId)
  const displayName = member.name ?? member.email
  const note = member.locked
    ? "Só um admin pode alterar outro admin."
    : member.lastAdmin
      ? "Último admin do workspace. Promova outra pessoa antes de mudar este nível."
      : null

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{invite ? "Gerenciar convite" : "Gerenciar usuário"}</SheetTitle>
        <SheetDescription>Visualize as informações do usuário e gerencie as permissões dele.</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <SectionLabel icon={UserIcon}>Informações do usuário</SectionLabel>
        <div className="flex items-center gap-4 bg-muted p-4">
          <Avatar className="size-18">
            {member.image && <AvatarImage src={member.image} alt={displayName} />}
            <InitialFallback name={displayName} className="text-2xl" />
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className={member.name ? "truncate font-medium" : "truncate text-muted-foreground"}>
              {member.name ?? "—"}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
              <MailIcon className="size-3.5 shrink-0" />
              <span className="truncate">{member.email}</span>
            </span>
            <span className="flex flex-wrap gap-1.5">
              {role && <Badge variant={role.admin ? "default" : "secondary"}>{role.name}</Badge>}
              {invite && <Badge variant="outline">{INVITE_STATUS_LABELS[member.status as keyof typeof INVITE_STATUS_LABELS]}</Badge>}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 bg-muted px-4 py-3 text-sm">
          <span className="font-medium whitespace-nowrap">{invite ? "ID do convite" : "ID do usuário"}</span>
          <span className="truncate font-mono text-[13px] text-muted-foreground">{member.id}</span>
        </div>
        <SectionLabel icon={ShieldCheckIcon}>Permissões</SectionLabel>
        <Field>
          <FieldLabel htmlFor={`manage-member-${member.id}-role`}>
            Nível de permissão <span className="text-destructive">*</span>
          </FieldLabel>
          <RoleSelect
            id={`manage-member-${member.id}-role`}
            choices={choices}
            value={roleId}
            onValueChange={setRoleId}
            disabled={member.locked}
            lockAdmin={member.lastAdmin}
          />
        </Field>
        {note && (
          <div className="flex items-start gap-2 text-[13px] text-pretty text-muted-foreground">
            <LockIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>{note}</span>
          </div>
        )}
      </div>
      <SheetFooter>
        <Button type="submit" loading={pending} disabled={member.locked || !roleId || roleId === member.roleId}>
          {!pending && <CircleCheckIcon data-icon="inline-start" />}
          {pending ? "Salvando..." : "Salvar alterações"}
        </Button>
        <SheetClose render={<Button type="button" variant="outline" />}>Fechar</SheetClose>
      </SheetFooter>
    </form>
  )
}

function RemoveMemberDialog({
  workspaceId,
  workspaceName,
  member,
  open,
  onOpenChange,
}: {
  workspaceId: string
  workspaceName: string
  member: ManagedMember
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleRemove() {
    startTransition(async () => {
      const result = await removeMemberAction(workspaceId, member.id)
      setError(result.error)
      if (!result.error) {
        toast.success("Membro removido do workspace.")
        onOpenChange(false)
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
            <UserMinusIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Remover do workspace?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{member.name ?? member.email}</strong> perde o acesso ao {workspaceName}. A conta continua
            existindo e pode receber um novo convite depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleRemove} loading={pending}>
            {pending ? "Removendo..." : "Remover"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
