import Link from "@/components/shared/link"
import { hashInviteToken } from "@/service/workspace/[workspaceId]/users/member"
import { requireUser } from "@/service/(auth)/session"
import { WorkspaceMember } from "@/models/WorkspaceMember"
import { AcceptInviteButton } from "@/components/invite/[token]/accept-invite-button"
import { memberRoleNameStages } from "@/service/workspace/[workspaceId]/team/unit-team"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

// Sem sessão, o proxy manda para /login?callbackUrl=/invite/<token>, e o
// cadastro repassa o callbackUrl, então a pessoa volta aqui depois de entrar.
// A página só mostra o convite; aceitar é uma action (GET não altera dados).
export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params
  const user = await requireUser()

  const [invite] = await WorkspaceMember.aggregate<{
    email: string
    roleName: string | null
    expiresAt: Date
    workspaceName: string | null
  }>([
    { $match: { tokenHash: hashInviteToken(token), userId: null } },
    ...memberRoleNameStages(),
    { $lookup: { from: "workspaces", localField: "workspaceId", foreignField: "_id", as: "workspace" } },
    {
      $project: {
        _id: 0,
        email: 1,
        roleName: 1,
        expiresAt: 1,
        workspaceName: { $ifNull: [{ $first: "$workspace.name" }, null] },
      },
    },
  ])

  const expired = invite && invite.expiresAt <= new Date()

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        {!invite?.workspaceName ? (
          <InviteMessage title="Convite inválido" description="Este convite não existe ou já foi usado." />
        ) : expired ? (
          <InviteMessage
            title="Convite expirado"
            description="Peça um novo convite a quem convidou você."
          />
        ) : (
          <>
            <CardHeader>
              <CardTitle>Convite para {invite.workspaceName}</CardTitle>
              <CardDescription>
                Você foi convidado{invite.roleName && <> como <strong>{invite.roleName}</strong></>}. Convite enviado para{" "}
                <strong>{invite.email}</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Você está conectado como <strong className="text-foreground">{user.email}</strong>.
            </CardContent>
            <CardFooter>
              <AcceptInviteButton token={token} />
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  )
}

function InviteMessage({ title, description }: { title: string; description: string }) {
  return (
    <>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="outline" nativeButton={false} render={<Link href="/workspace" />}>
          Ir para o início
        </Button>
      </CardFooter>
    </>
  )
}
