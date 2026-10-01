import { SignupForm } from "@/components/(auth)/signup/signup-form"

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  const { callbackUrl } = await searchParams
  return <SignupForm callbackUrl={typeof callbackUrl === "string" ? callbackUrl : undefined} />
}
