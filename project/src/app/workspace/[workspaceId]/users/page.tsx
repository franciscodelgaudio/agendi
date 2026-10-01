import { notFound, redirect } from "next/navigation"
import { MailIcon, SettingsIcon, ShieldIcon, UserIcon } from "lucide-react"
import { ADMIN_ROLE_NAME, can, type Actor } from "@/lib/permissions"
import { requirePage } from "@/lib/page-guard"
import { requireUser, workspaceAccessStages } from "@/lib/session"
import { memberRoleNameStages, rolesLookup, type RoleOption } from "@/lib/unit-team"
import { parseUserListQuery, USER_PAGE_SIZE, userListPage, type UserListItem } from "@/lib/user-list"
import { Workspace } from "@/models/Workspace"
import { InviteMemberSheet } from "@/components/invite-member-sheet"
import { ListPagination } from "@/components/list-pagination"
import { ListSearch } from "@/components/list-search"
import { MemberActions } from "@/components/member-actions"
import { CodeCell, CodeHead } from "@/components/record-code"
import { SortableHead } from "@/components/sortable-head"
import { UserRoleFilter, UserStatusFilter } from "@/components/user-filters"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/initial-fallback"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Person = { id: string; name: string | null; email: string; image: string | null }
type Member = Person & {
  admin: boolean
  roleId: string | null
  roleName: string | null
  pending: boolean
  expiresAt: Date | null
}

export default async function UsersPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/users">) {
  const { workspaceId } = await params
  const query = parseUserListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "users" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  // Layout e página renderizam em paralelo, então o acesso é verificado aqui também.
  const [workspace] = await Workspace.aggregate<{ actor: Actor; roles: RoleOption[]; members: Member[] }>([
    ...access,
    rolesLookup(),
    {
      $lookup: {
        from: "workspace_members",
        localField: "_id",
        foreignField: "workspaceId",
        as: "members",
        pipeline: [
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          { $set: { user: { $first: "$user" } } },
          ...memberRoleNameStages(),
          // Aceitos primeiro, depois convites; cada grupo por ordem de criação.
          { $sort: { acceptedAt: -1, createdAt: 1 } },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              admin: { $eq: ["$admin", true] },
              roleId: { $ifNull: [{ $toString: "$roleId" }, null] },
              roleName: 1,
              email: { $ifNull: ["$user.email", "$email"] },
              name: { $ifNull: ["$user.name", null] },
              image: { $ifNull: ["$user.image", null] },
              pending: { $eq: [{ $ifNull: ["$userId", null] }, null] },
              expiresAt: { $ifNull: ["$expiresAt", null] },
            },
          },
        ],
      },
    },
    { $project: { _id: 0, actor: 1, roles: 1, members: 1 } },
  ])
  if (!workspace) notFound()
  const { actor } = workspace
  const canManage = can(actor, "users.manage")
  // Só administradores atribuem a função de administrador e mexem em administradores.
  const choices = { roles: workspace.roles, allowAdmin: actor.admin }
  const now = new Date()

  // Busca, filtros e paginação são feitos aqui (poucos por workspace).
  const people: UserListItem[] = workspace.members.map(({ pending, expiresAt, ...member }) => ({
    ...member,
    status: !pending ? ("active" as const) : expiresAt && expiresAt <= now ? ("expired" as const) : ("pending" as const),
  }))
  const result = userListPage(people, query)

  const pathname = `/workspace/${workspaceId}/users`
  // Filtros mudam sem levar a página junto, então a lista volta para a primeira.
  const { page, ...filters } = query
  // Página além da última (ex.: depois de remover o último usuário dela) vai para a última.
  const pages = Math.ceil(result.total / USER_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(
      Object.entries({ ...filters, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v),
    )
    redirect(`${pathname}?${params}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <ListSearch query={filters} placeholder="Buscar nome ou email..." />
          <UserRoleFilter query={filters} roles={workspace.roles} />
          <UserStatusFilter query={filters} />
        </div>
        {canManage && <InviteMemberSheet workspaceId={workspaceId} choices={choices} />}
      </div>
      <div className="border">
        <Table>
          <TableHeader>
            <TableRow>
              <CodeHead className="@max-3xl:hidden" />
              <SortableHead field="name" label="Nome" icon={UserIcon} query={filters} pathname={pathname} className="w-full" />
              <SortableHead
                field="email"
                label="Email"
                icon={MailIcon}
                query={filters}
                pathname={pathname}
                className="@max-2xl:hidden"
              />
              <HeadWithIcon icon={ShieldIcon} label="Função" />
              {canManage && <HeadWithIcon icon={SettingsIcon} label="Ações" className="w-0 text-right" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 5 : 4} className="h-24 px-4 text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            ) : (
              result.rows.map((person) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  canManage={canManage}
                  actions={
                    (actor.admin || !person.admin) && (
                      <MemberActions
                        workspaceId={workspaceId}
                        member={{
                          ...person,
                          role: person.admin ? "admin" : person.roleId,
                          pending: person.status !== "active",
                        }}
                        choices={choices}
                      />
                    )
                  }
                >
                  <div className="flex items-center gap-1.5">
                    {person.admin ? (
                      <Badge>{ADMIN_ROLE_NAME}</Badge>
                    ) : (
                      <Badge variant={person.roleName ? "secondary" : "outline"}>{person.roleName ?? "Sem função"}</Badge>
                    )}
                    {person.status !== "active" && (
                      <Badge variant="outline">
                        {person.status === "expired" ? "Convite expirado" : "Convite pendente"}
                      </Badge>
                    )}
                  </div>
                </PersonRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <ListPagination
        query={filters}
        page={page}
        pageSize={USER_PAGE_SIZE}
        total={result.total}
        pathname={pathname}
        itemLabel="usuários"
      />
    </div>
  )
}

function HeadWithIcon({
  icon: Icon,
  label,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  className?: string
}) {
  return (
    <TableHead className={`px-4 ${className ?? ""}`}>
      <span className="inline-flex items-center gap-1">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
    </TableHead>
  )
}

function PersonRow({
  person,
  canManage,
  actions,
  children,
}: {
  person: Person
  canManage: boolean
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const displayName = person.name ?? person.email
  return (
    <TableRow>
      <CodeCell id={person.id} className="@max-3xl:hidden" />
      <TableCell className="max-w-0 px-4">
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            {person.image && <AvatarImage src={person.image} alt={displayName} />}
            <InitialFallback name={displayName} />
          </Avatar>
          <span className={person.name ? "truncate font-medium" : "truncate text-muted-foreground"}>
            {person.name ?? "—"}
          </span>
        </div>
      </TableCell>
      <TableCell className="px-4 text-muted-foreground @max-2xl:hidden">{person.email}</TableCell>
      <TableCell className="px-4">{children}</TableCell>
      {canManage && <TableCell className="px-4 text-right">{actions}</TableCell>}
    </TableRow>
  )
}
