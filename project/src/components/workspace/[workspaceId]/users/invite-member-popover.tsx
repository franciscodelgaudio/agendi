"use client"

import { useActionState, useState } from "react"
import { CirclePlusIcon, SendIcon } from "lucide-react"
import { toast } from "sonner"
import { inviteMemberAction, type MemberFormState } from "@/lib/actions/member"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { RoleSelect, type RoleChoices } from "@/components/workspace/[workspaceId]/users/member-fields"

export function InviteMemberPopover({ workspaceId, choices }: { workspaceId: string; choices: RoleChoices }) {
  const [open, setOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setFormKey((k) => k + 1)
        setOpen(next)
      }}
    >
      <PopoverTrigger data-tour="invite-member" render={<Button />}>
        <CirclePlusIcon data-icon="inline-start" />
        Convidar usuário
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} className="w-[min(340px,calc(100vw-32px))] gap-2.5">
        <InviteMemberForm key={formKey} workspaceId={workspaceId} choices={choices} onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

function InviteMemberForm({
  workspaceId,
  choices,
  onDone,
}: {
  workspaceId: string
  choices: RoleChoices
  onDone: () => void
}) {
  const [email, setEmail] = useState("")
  const [roleId, setRoleId] = useState<string | null>(null)
  const [state, formAction, pending] = useActionState(
    async (prev: MemberFormState, formData: FormData) => {
      const next = await inviteMemberAction(workspaceId, prev, formData)
      if (!next.error) {
        toast.success(`Convite enviado para ${email.trim().toLowerCase()}.`)
        onDone()
      }
      return next
    },
    { error: null },
  )

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <PopoverTitle className="text-[15px]">Convidar membro</PopoverTitle>
      <Input
        name="email"
        type="email"
        placeholder="Email (email@gmail.com)"
        aria-label="Email do convidado"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        aria-invalid={!!state.error || undefined}
        autoFocus
        required
      />
      <div className="flex gap-2">
        <RoleSelect
          choices={choices}
          value={roleId}
          onValueChange={setRoleId}
          aria-label="Função do convidado"
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Enviar convite"
          loading={pending}
          disabled={!email.trim() || !roleId}
        >
          <SendIcon />
        </Button>
      </div>
      {state.error && <span className="text-xs text-destructive">{state.error}</span>}
      <span className="text-xs leading-relaxed text-pretty text-muted-foreground">
        Obs: Se o e-mail for válido, será enviado um convite para o ingresso ao time.
      </span>
    </form>
  )
}
