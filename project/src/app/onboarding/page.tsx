import { WorkspaceOnboarding } from "@/components/onboarding/workspace-onboarding"
import { requireUser } from "@/service/(auth)/session"

export default async function OnboardingPage() {
  await requireUser()
  return <WorkspaceOnboarding />
}
