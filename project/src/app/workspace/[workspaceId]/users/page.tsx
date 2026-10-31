import { notFound, redirect } from "next/navigation"
import { MailIcon, Settings2Icon, ShieldCheckIcon, UserIcon } from "lucide-react"
import { can, type Actor } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { requirePage } from "@/service/workspace/[workspaceId]/page-guard"
import { requireUser, workspaceAccessStages } from "@/service/(auth)/session"
import { countAdmins } from "@/service/workspace/[workspaceId]/users/member-store"
import {
  parseUserListQuery,
  USER_LIST_COLLATION,
  USER_PAGE_SIZE,
  userListPipeline,
  type UserListItem,
  type UserListPage,
} from "@/service/workspace/[workspaceId]/users/user-list"
import { Workspace } from "@/models/Workspace"
import { WorkspaceMember } from "@/models/WorkspaceMember"
import { InviteMemberPopover } from "@/components/workspace/[workspaceId]/users/invite-member-popover"
import { ListPagination } from "@/components/shared/list-pagination"
import { ListSearch } from "@/components/shared/list-search"
import { MemberActions } from "@/components/workspace/[workspaceId]/users/member-actions"
import { INVITE_STATUS_LABELS } from "@/components/workspace/[workspaceId]/users/user-labels"
import type { RoleOption } from "@/components/workspace/[workspaceId]/users/member-fields"
import { SortableHead } from "@/components/shared/sortable-head"
import { UserRoleFilter } from "@/components/workspace/[workspaceId]/users/user-filters"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/shared/initial-fallback"
import { userAvatarSrc } from "@/components/shared/user-avatar-src"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export default async function UsersPage({ params, searchParams }: PageProps<"/workspace/[workspaceId]/users">) {
  const { workspaceId } = await params
  const query = parseUserListQuery(await searchParams)
  const user = await requireUser()
  await requirePage(workspaceId, user.id, { workspace: "users" })
  const access = workspaceAccessStages(workspaceId, user.id)
  if (!access) notFound()

  const [workspace] = await Workspace.aggregate<{ name: string; actor: Actor; roles: RoleOption[] }>([
    ...access,
    {
      $project: {
        _id: 0,
        name: 1,
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

  const [[result], adminCount] = await Promise.all([
    WorkspaceMember.aggregate<UserListPage>(userListPipeline(workspaceId, query, new Date()), {
      collation: USER_LIST_COLLATION,
    }),
    countAdmins(workspaceId),
  ])

  const pathname = `/workspace/${workspaceId}/users`
  const { page, ...filters } = query
  const pages = Math.ceil(result.total / USER_PAGE_SIZE)
  if (pages > 0 && page > pages) {
    const params = new URLSearchParams(
      Object.entries({ ...filters, page: pages > 1 ? String(pages) : "" }).filter(([, v]) => v),
    )
    redirect(`${pathname}?${params}`)
  }

  const myEmail = user.email?.trim().toLowerCase()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ListSearch query={filters} placeholder="Buscar nome ou email..." />
          <UserRoleFilter query={filters} roles={roles} />
        </div>
        {canManage && <InviteMemberPopover workspaceId={workspaceId} choices={choices} />}
      </div>
      <div className="border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead field="name" label="Nome" icon={UserIcon} query={filters} pathname={pathname} className="w-full" />
              <SortableHead
                field="email"
                label="Email"
                icon={MailIcon}
                query={filters}
                pathname={pathname}
                className="@max-2xl:hidden"
              />
              <HeadWithIcon icon={ShieldCheckIcon} label="Acesso" />
              {canManage && <HeadWithIcon icon={Settings2Icon} label="Ações" className="w-0 text-right" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 4 : 3} className="h-24 px-4 text-center text-muted-foreground">
                  Nenhum membro encontrado com esses filtros.
                </TableCell>
              </TableRow>
            ) : (
              result.rows.map((person) => {
                const role = rolesById.get(person.roleId)
                const admin = !!role?.admin
                return (
                  <PersonRow key={person.id} person={person} isMe={person.email === myEmail}>
                    <AccessCell person={person} role={role} />
                    {canManage && (
                      <TableCell className="px-3 py-1 text-right">
                        <MemberActions
                          workspaceId={workspaceId}
                          workspaceName={workspace.name}
                          member={{
                            ...person,
                            locked: admin && !actor.admin,
                            lastAdmin: admin && person.status === "active" && adminCount <= 1,
                          }}
                          choices={choices}
                        />
                      </TableCell>
                    )}
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
        itemLabel="membros"
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
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
    </TableHead>
  )
}

function AccessCell({ person, role }: { person: UserListItem; role: RoleOption | undefined }) {
  return (
    <TableCell className="px-4">
      {person.status === "active" ? (
        <Badge variant={role?.admin ? "default" : "secondary"}>{role?.name ?? "Sem função"}</Badge>
      ) : (
        <Badge variant="outline">{INVITE_STATUS_LABELS[person.status]}</Badge>
      )}
    </TableCell>
  )
}

function PersonRow({
  person,
  isMe,
  children,
}: {
  person: UserListItem
  isMe: boolean
  children: React.ReactNode
}) {
  const displayName = person.name ?? person.email
  return (
    <TableRow>
      <TableCell className="max-w-0 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="size-10">
            <AvatarImage src={userAvatarSrc(person, 80)} alt={displayName} />
            <InitialFallback name={displayName} />
          </Avatar>
          <span className={person.name ? "truncate font-medium" : "truncate text-muted-foreground"}>
            {person.name ?? "—"}
          </span>
          {isMe && <span className="shrink-0 text-xs text-muted-foreground">(você)</span>}
        </div>
      </TableCell>
      <TableCell className="px-4 whitespace-nowrap text-muted-foreground @max-2xl:hidden">{person.email}</TableCell>
      {children}
    </TableRow>
  )
}
