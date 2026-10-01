"use client"

import { useActionState } from "react"
import Link from "@/components/link"
import { cn } from "@/lib/utils"
import { signupAction } from "@/lib/actions/auth"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function SignupForm({
  className,
  callbackUrl,
  ...props
}: Omit<React.ComponentProps<"form">, "action"> & { callbackUrl?: string }) {
  const [state, formAction, pending] = useActionState(signupAction, {
    error: null,
  })

  return (
    <form
      action={formAction}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Crie sua conta</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Preencha os dados abaixo para se cadastrar
          </p>
        </div>
        {state.error && (
          <FieldError className="text-center">{state.error}</FieldError>
        )}
        <Field>
          <FieldLabel htmlFor="name">Nome</FieldLabel>
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="m@example.com"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <FieldDescription>Pelo menos 8 caracteres.</FieldDescription>
        </Field>
        <Field>
          <Button type="submit" loading={pending}>
            {pending ? "Criando conta..." : "Criar conta"}
          </Button>
          <FieldDescription className="text-center">
            Ao criar a conta, você concorda com os{" "}
            <Link href="/terms" target="_blank" className="underline underline-offset-4">
              Termos de uso
            </Link>
          </FieldDescription>
          <FieldDescription className="text-center">
            Já tem uma conta?{" "}
            <Link href={callbackUrl ? `/login?${new URLSearchParams({ callbackUrl })}` : "/login"} className="underline underline-offset-4">
              Entrar
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
