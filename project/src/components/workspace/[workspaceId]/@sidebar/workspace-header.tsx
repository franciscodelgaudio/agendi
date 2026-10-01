"use client"

import { useActionState, useState } from "react"
import { updateWorkspaceAction, type UpdateWorkspaceState } from "@/lib/actions/workspace"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { ImageUploadField } from "@/components/shared/image-upload-field"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

type Workspace = { id: string; name: string; avatarUrl: string | null }

type Props = {
  workspace: Workspace
  // Quem pode editar o workspace abre a edição ao clicar.
  canManage: boolean
}

export function WorkspaceHeader({ workspace, canManage }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  // Muda a cada abertura para remontar o formulário com os valores atuais e sem erro antigo.
  const [editKey, setEditKey] = useState(0)

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            tooltip={workspace.name}
            onClick={
              canManage
                ? () => {
                    setEditKey((k) => k + 1)
                    setEditOpen(true)
                  }
                : undefined
            }
          >
            <Avatar className="size-8 rounded-lg after:rounded-lg">
              {workspace.avatarUrl && (
                <AvatarImage src={workspace.avatarUrl} alt={workspace.name} className="rounded-lg object-contain" />
              )}
              <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                {workspace.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{workspace.name}</span>
              <span className="truncate text-xs text-muted-foreground">Workspace</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      {canManage && (
        <Sheet open={editOpen} onOpenChange={setEditOpen}>
          <SheetContent>
            <EditWorkspaceForm key={editKey} workspace={workspace} onDone={() => setEditOpen(false)} />
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}

function EditWorkspaceForm({ workspace: current, onDone }: { workspace: Workspace; onDone: () => void }) {
  // Congela os valores iniciais: após salvar, o refresh muda o workspace enquanto o Sheet ainda fecha.
  const [workspace] = useState(current)
  const [state, formAction, pending] = useActionState(
    async (prev: UpdateWorkspaceState, formData: FormData) => {
      const next = await updateWorkspaceAction(workspace.id, prev, formData)
      if (!next.error) onDone()
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Editar workspace</SheetTitle>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <Field>
          <FieldLabel htmlFor="edit-workspace-name">Nome</FieldLabel>
          <Input
            id="edit-workspace-name"
            name="name"
            placeholder="Spa Central"
            defaultValue={workspace.name}
            maxLength={80}
            autoFocus
            required
          />
        </Field>
        <ImageUploadField
          id="edit-workspace-image"
          label="Imagem (opcional)"
          workspaceId={workspace.id}
          target="workspace"
          defaultValue={workspace.avatarUrl}
        />
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending}>
          {pending ? "Salvando..." : "Salvar"}
        </Button>
      </SheetFooter>
    </form>
  )
}
