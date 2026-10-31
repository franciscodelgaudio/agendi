"use client"

import { useActionState, useState } from "react"
import { toast } from "sonner"
import { updateWorkspaceAction, type UpdateWorkspaceState } from "@/lib/actions/workspace"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { useImageUpload } from "@/components/shared/image-upload-field"
import { WorkspaceImagePicker } from "@/components/shared/workspace-image-picker"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

type Workspace = { id: string; name: string; imageUrl: string | null }

type Props = {
  workspace: Workspace
  canManage: boolean
}

export function WorkspaceHeader({ workspace, canManage }: Props) {
  const [editOpen, setEditOpen] = useState(false)
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
            <Avatar className="size-8 rounded-none after:rounded-none">
              {workspace.imageUrl && (
                <AvatarImage src={workspace.imageUrl} alt={workspace.name} className="rounded-none object-cover" />
              )}
              <AvatarFallback className="rounded-none bg-primary font-medium text-primary-foreground">
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
  const [workspace] = useState(current)
  const [name, setName] = useState(workspace.name)
  const image = useImageUpload({ workspaceId: workspace.id, target: "workspace", defaultValue: workspace.imageUrl })
  const [state, formAction, pending] = useActionState(
    async (prev: UpdateWorkspaceState, formData: FormData) => {
      const next = await updateWorkspaceAction(workspace.id, prev, formData)
      if (!next.error) {
        toast.success("Workspace atualizado")
        onDone()
      }
      return next
    },
    { error: null },
  )

  const nameMissing = !name.trim()
  const dirty = name.trim() !== workspace.name || image.url !== (workspace.imageUrl ?? "")

  return (
    <form action={formAction} className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Workspace</SheetTitle>
        <SheetDescription>Nome e imagem do seu negócio no Agendi.</SheetDescription>
      </SheetHeader>
      <FieldGroup className="min-h-0 flex-1 gap-7 overflow-y-auto px-4">
        {state.error && <FieldError>{state.error}</FieldError>}
        <WorkspaceImagePicker image={image} name={name.trim() || workspace.name} />
        <Field data-invalid={nameMissing || undefined}>
          <FieldLabel htmlFor="edit-workspace-name">Nome do negócio</FieldLabel>
          <Input
            id="edit-workspace-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            aria-invalid={nameMissing || undefined}
            autoFocus
          />
          {nameMissing && <FieldError>Informe o nome do negócio.</FieldError>}
        </Field>
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={pending} disabled={!dirty || nameMissing || image.uploading}>
          {pending ? "Salvando..." : "Salvar alterações"}
        </Button>
        <SheetClose render={<Button type="button" variant="outline" />}>Cancelar</SheetClose>
      </SheetFooter>
    </form>
  )
}
