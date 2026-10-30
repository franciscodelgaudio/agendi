import { notFound, redirect } from "next/navigation"
import { MailIcon, SettingsIcon, ShieldIcon, UserIcon } from "lucide-react"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import {
  parseUserListQuery,
  USER_LIST_COLLATION,
  USER_PAGE_SIZE,
  userListPipeline,
  type UserListPage,
} from "@/service/workspace/[workspaceId]/users/user-list"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"
import { InviteMemberSheet } from "@/components/workspace/[workspaceId]/users/invite-member-sheet"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { MemberActions } from "@/components/workspace/[workspaceId]/users/member-actions"
import type { RoleOption } from "@/components/workspace/[workspaceId]/users/member-fields"
import { CodeCell, CodeHead } from "@/components/shared/record-code"
import { SortableHead } from "@/components/shared/sortable-head"
import { UserRoleFilter, UserStatusFilter } from "@/components/workspace/[workspaceId]/users/user-filters"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/shared/initial-fallback"
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

export default async function UsersPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/users">) {
  const { workspaceId } = await params
  const query = parseUserListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "users" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ actor: Actor; roles: RoleOption[] }>([
    ...access,
    {
      $project: {
        _id: 0,
        actor: 1,
        roles: {
          $map: {
            input: { $sortArray: { input: "$roles", sortBy: { name: 1 } } },
            in: { id: { $toString: "$$this._id" }, name: "$$this.name", admin: { $eq: ["$$this.admin", true] } },
          },
        },
      },
    },
  ])
  if (!workspace) notFound()
  const { actor, roles } = workspace
  const canManage = can(actor, "users.manage")
  const choices = { roles, allowAdmin: actor.admin }
  const rolesById = new Map(roles.map((role) => [role.id, role]))

  const [result] = await WorkspaceMember.aggregate<UserListPage>(userListPipeline(workspaceId, query, new Date()), {
    collation: USER_LIST_COLLATION,
  })

  const pathname = `/workspace/${workspaceId}/users`
  const { page, ...filters } = query
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
          <UserRoleFilter query={filters} roles={roles} />
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
              result.rows.map((person) => {
                const role = rolesById.get(person.roleId)
                const admin = !!role?.admin
                return (
                  <PersonRow
                    key={person.id}
                    person={person}
                    canManage={canManage}
                    actions={
                      (actor.admin || !admin) && (
                        <MemberActions
                          workspaceId={workspaceId}
                          member={{ ...person, pending: person.status !== "active" }}
                          choices={choices}
                        />
                      )
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <Badge variant={admin ? "default" : "secondary"}>{role?.name ?? "Sem função"}</Badge>
                      {person.status !== "active" && (
                        <Badge variant="outline">
                          {person.status === "expired" ? "Convite expirado" : "Convite pendente"}
                        </Badge>
                      )}
                    </div>
                  </PersonRow>
                )
              })
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
