import { logoutAction } from "@/lib/actions/auth"

// Telas fora da sidebar (planos): mostra a conta da sessão e permite trocar de conta.
export function SignedInAs({ email }: { email?: string | null }) {
  return (
    <form action={logoutAction} className="flex items-center gap-3 text-sm text-ld-ink-soft">
      {email && <span className="truncate">{email}</span>}
      <button
        type="submit"
        className="font-medium text-ld-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ld-brand"
      >
        Sair
      </button>
    </form>
  )
}
