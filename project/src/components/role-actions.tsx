"use client"

import { useActionState, useState, useTransition } from "react"
import { PlusIcon } from "lucide-react"
import { createRoleAction, deleteRoleAction, renameRoleAction, type RoleFormState } from "@/lib/actions/role"
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export function CreateRoleSheet({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário vazio e sem erro antigo.
  const [formKey, setFormKey] = useState(0)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) setFormKey((k) => k + 1)
        setOpen(next)
      }}
    >
      <SheetTrigger render={<Button />}>
        <PlusIcon />
        Nova função
      </SheetTrigger>
      <SheetContent>
        <RoleNameForm
          key={formKey}
          title="Nova função"
          description="Ela começa vendo todas as páginas e sem poder alterar nada. Depois marque o que ela pode fazer."
          submitLabel="Criar"
          action={(prev, formData) => createRoleAction(workspaceId, prev, formData)}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}

export function RenameRoleSheet({
  workspaceId,
  role,
  open,
  onOpenChange,
}: {
  workspaceId: string
  role: { id: string; name: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        {open && (
          <RoleNameForm
            title="Renomear função"
            submitLabel="Salvar"
            defaultName={role.name}
            action={(prev, formData) => renameRoleAction(workspaceId, role.id, prev, formData)}
            onDone={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

function RoleNameForm({
  title,
  description,
  submitLabel,
  defaultName,
  action,
  onDone,
}: {
  title: string
  description?: string
  submitLabel: string
  defaultName?: string
  action: (prev: RoleFormState, formData: FormData) => Promise<RoleFormState>
  onDone: () => void
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: RoleFormState, formData: FormData) => {
      const next = await action(prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
        {description && <SheetDescription>{description}</SheetDescription>}
      </SheetHeader>
      {/* Só os campos rolam; título e botões ficam fixos. */}
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor="role-name">Nome</FieldLabel>
          <Input
            id="role-name"
            name="name"
            defaultValue={defaultName}
            placeholder="Ex.: Massagista"
            maxLength={40}
            autoFocus
            required
          />
        </Field>
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : submitLabel}
        </Button>
      </SheetFooter>
    </form>
  )
}

export function DeleteRoleDialog({
  workspaceId,
  role,
  open,
  onOpenChange,
  onDeleted,
}: {
  workspaceId: string
  role: { id: string; name: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteRoleAction(workspaceId, role.id)
      setError(result.error)
      if (!result.error) {
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
          <AlertDialogTitle>Excluir função?</AlertDialogTitle>
          <AlertDialogDescription>
            A função <strong>{role.name}</strong> e as permissões dela serão apagadas. Só é possível excluir uma
            função sem usuários nem convites.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <FieldError>{error}</FieldError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Voltar</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDelete} loading={pending}>
            {pending ? "Excluindo..." : "Excluir"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
