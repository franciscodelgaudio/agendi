"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { acceptInviteAction } from "@/lib/actions/member"
import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptInviteAction(token)
      setError(result.error)
      if (result.workspaceId) router.push(`/workspace/${result.workspaceId}`)
    })
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {error && <FieldError>{error}</FieldError>}
      <Button onClick={handleAccept} loading={pending} className="w-full">
        {pending ? "Aceitando..." : "Aceitar convite"}
      </Button>
    </div>
  )
}
