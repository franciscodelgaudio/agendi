"use server"

import { signIn, signOut } from "@/auth"
import { registerUser, type RegisterError } from "@/service/(auth)/signup/register"
import { User } from "@/models/User"

const errorMessages: Record<RegisterError, string> = {
  invalid_input: "Preencha todos os campos.",
  invalid_name: "Informe seu nome.",
  invalid_email: "Informe um email válido.",
  password_too_short: "A senha precisa ter pelo menos 8 caracteres.",
  password_too_long: "A senha é longa demais.",
  email_taken: "Este email já está cadastrado.",
}

export type SignupState = { error: string | null }

// Pública: é o cadastro, então não exige sessão.
export async function signupAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const input = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  }

  const result = await registerUser(input, {
    findUserByEmail: async (email) => {
      const found = await User.exists({ email })
      return found && { id: found._id.toString() }
    },
    createUser: async (data) => {
      const user = await User.create(data)
      return { id: user._id.toString() }
    },
  })

  if (!result.ok) return { error: errorMessages[result.error] }

  // Entra direto após o cadastro; o signIn lança o redirect para o callbackUrl
  // (ex: link de convite) ou "/workspace". Como no login, o callback redirect do Auth.js
  // só aceita destinos do próprio app.
  const callbackUrl = formData.get("callbackUrl")
  await signIn("credentials", {
    email: input.email,
    password: input.password,
    redirectTo: typeof callbackUrl === "string" && callbackUrl ? callbackUrl : "/workspace",
  })
  return { error: null }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" })
}
