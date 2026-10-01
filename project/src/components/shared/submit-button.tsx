"use client"

import { useFormStatus } from "react-dom"
import { Button } from "@/components/ui/button"

// Botão de envio que carrega junto com o form (useFormStatus), para forms de server action sem
// estado no cliente. Com name/value, só este botão mostra o spinner quando foi ele o clicado:
// o React inclui o botão que enviou no FormData. Com formAction de função o React reserva o name,
// então o botão clicado é identificado pela action em andamento.
export function SubmitButton({ name, value, formAction, ...props }: React.ComponentProps<typeof Button> & { value?: string }) {
  const { pending, data, action } = useFormStatus()
  const submitter = typeof formAction === "function" ? action === formAction : !name || data?.get(name) === value
  return <Button type="submit" name={name} value={value} formAction={formAction} {...props} loading={pending && submitter} disabled={pending} />
}
