"use client"

import { useActionState, useState, useTransition } from "react"
import { EllipsisIcon, PencilIcon, UserMinusIcon } from "lucide-react"
import { removeMemberAction, updateMemberAction, type MemberFormState } from "@/lib/actions/member"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldDescription, FieldError, FieldGroup } from "@/components/ui/field"
import { MemberNameField, RoleField, type RoleChoices } from "@/components/member-fields"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

// pending = convite ainda não aceito (sem conta vinculada, então sem nome para editar).
// role: "admin", o id da role ou null (ainda sem role).
type Member = { id: string; email: string; name: string | null; role: string | null; pending: boolean }

export function MemberActions({
  workspaceId,
  member,
  choices,
}: {
  workspaceId: string
  member: Member
  choices: RoleChoices
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [removeOpen, setRemoveOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)
  const label = member.name ?? member.email

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${label}`} />}>
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            onClick={() => {
              setEditKey((k) => k + 1)
              setEditOpen(true)
            }}
          >
            <PencilIcon />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setRemoveOpen(true)}>
            <UserMinusIcon />
            {member.pending ? "Cancelar convite" : "Remover"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent>
          <EditMemberForm
            key={editKey}
            workspaceId={workspaceId}
            member={member}
            choices={choices}
            onDone={() => setEditOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <RemoveMemberDialog
        workspaceId={workspaceId}
        member={member}
        open={removeOpen}
        onOpenChange={setRemoveOpen}
      />
    </>
  )
}

function EditMemberForm({
  workspaceId,
  member,
  choices,
  onDone,
}: {
  workspaceId: string
  member: Member
  choices: RoleChoices
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: MemberFormState, formData: FormData) => {
      const next = await updateMemberAction(workspaceId, member.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Editar usuário</SheetTitle>
        <SheetDescription>{member.email}</SheetDescription>
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        {member.pending ? (
          <FieldDescription>
            O convite ainda não foi aceito. O nome poderá ser editado depois que a pessoa entrar.
          </FieldDescription>
        ) : (
          <MemberNameField idPrefix={`edit-member-${member.id}`} defaultValue={member.name ?? ""} />
        )}
        <RoleField idPrefix={`edit-member-${member.id}`} choices={choices} defaultValue={member.role} />
        {!member.pending && (
          <FieldDescription>
            O nome é da conta da pessoa: a alteração vale em todos os workspaces dela. Para trocar o email,
            remova e convide de novo.
          </FieldDescription>
        )}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}

function RemoveMemberDialog({
  workspaceId,
  member,
  open,
  onOpenChange,
}: {
  workspaceId: string
  member: Member
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleRemove() {
    startTransition(async () => {
      const result = await removeMemberAction(workspaceId, member.id)
      setError(result.error)
      if (!result.error) onOpenChange(false)
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
          <AlertDialogTitle>{member.pending ? "Cancelar convite?" : "Remover usuário?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {member.pending ? (
              <>
                O convite para <strong>{member.email}</strong> deixará de funcionar.
              </>
            ) : (
              <>
                <strong>{member.name ?? member.email}</strong> perderá o acesso a este workspace. A conta dela
                não é excluída.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleRemove} loading={pending}>
            {pending ? "Removendo..." : member.pending ? "Cancelar convite" : "Remover"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
