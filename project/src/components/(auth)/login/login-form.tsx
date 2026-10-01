import Link from "@/components/shared/link"
import { cn } from "@/service/_shared/utils"

import { SubmitButton } from "@/components/shared/submit-button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"

type LoginFormProps = Omit<React.ComponentProps<"form">, "action"> & {
  credentialsAction: (formData: FormData) => Promise<void>
  googleAction: () => Promise<void>
  error?: string | null
  // Leva o callbackUrl para o cadastro (ex: quem veio de um link de convite).
  signupHref?: string
}

export function LoginForm({
  className,
  credentialsAction,
  googleAction,
  error,
  signupHref = "/signup",
  ...props
}: LoginFormProps) {
  return (
    <form
      action={credentialsAction}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Entre na sua conta</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Digite seu email abaixo para acessar sua conta
          </p>
        </div>
        {error && <FieldError className="text-center">{error}</FieldError>}
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
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <a
              href="#"
              className="ml-auto text-sm underline-offset-4 hover:underline"
            >
              Esqueceu sua senha?
            </a>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Field>
          <SubmitButton name="intent" value="credentials">
            Entrar
          </SubmitButton>
        </Field>
        <FieldSeparator>Ou continue com</FieldSeparator>
        <Field>
          {/* formAction troca a action só deste botão; formNoValidate
              evita exigir email/senha para entrar com Google. */}
          <SubmitButton
            variant="outline"
            formAction={googleAction}
            formNoValidate
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            Entrar com Google
          </SubmitButton>
          <FieldDescription className="text-center">
            Não tem uma conta?{" "}
            <Link href={signupHref} className="underline underline-offset-4">
              Cadastre-se
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
