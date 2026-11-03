import Link from "@/components/shared/link"
import { ClockIcon, ArmchairIcon, UsersIcon } from "lucide-react"
import { UnitActions } from "@/components/workspace/[workspaceId]/unit/unit-actions"
import { colorFor, InitialFallback } from "@/components/shared/initial-fallback"
import { Avatar, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import type { UnitFormOptions, UnitFormValues } from "@/components/workspace/[workspaceId]/unit/unit-fields"
import { cn } from "@/service/_shared/utils"

const VISIBLE_MEMBERS = 4

type Props = {
  units: UnitFormValues[]
  options: UnitFormOptions
  pathname: string
  workspaceId: string
  canManage: boolean
}

function UnitImage({ unit }: { unit: UnitFormValues }) {
  return (
    <div className="aspect-video w-full overflow-hidden border-b bg-muted">
      {unit.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={unit.imageUrl} alt="" className="size-full object-cover transition-transform group-hover/card:scale-105" />
      ) : (
        <div className={cn("flex size-full items-center justify-center text-5xl font-semibold", colorFor(unit.name))}>
          {unit.name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  )
}

function UnitMembers({ ids, members }: { ids: string[]; members: UnitFormOptions["members"] }) {
  const selected = members.filter((member) => ids.includes(member.id))
  if (!selected.length) return <span className="text-muted-foreground">Nenhum usuário</span>
  const hidden = selected.length - VISIBLE_MEMBERS

  return (
    <div className="flex min-w-0 items-center gap-2">
      <AvatarGroup>
        {selected.slice(0, VISIBLE_MEMBERS).map((member) => (
          <Avatar key={member.id} size="sm">
            {member.image && <AvatarImage src={member.image} alt={member.name} />}
            <InitialFallback name={member.name} />
          </Avatar>
        ))}
        {hidden > 0 && <AvatarGroupCount className="size-6 text-xs">+{hidden}</AvatarGroupCount>}
      </AvatarGroup>
      <span className="truncate text-muted-foreground">
        {selected.length === 1 ? selected[0].name : `${selected.length} usuários`}
      </span>
    </div>
  )
}

function InfoRow({ icon: Icon, label, children }: { icon: typeof ClockIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={label} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function UnitCards({ units, options, pathname, workspaceId, canManage }: Props) {
  if (units.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center border border-dashed text-muted-foreground">
        Nenhuma unidade encontrada.
      </div>
    )
  }

  return (
    <div className="@container">
      <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {units.map((unit) => (
          <Card key={unit.id} className="relative pt-0">
            <UnitImage unit={unit} />
            <CardContent className="gap-4">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`${pathname}/${unit.id}`}
                  className="truncate text-base font-semibold after:absolute after:inset-0 hover:underline"
                >
                  {unit.name}
                </Link>
                {canManage && (
                  <div className="relative z-10 -my-1 shrink-0">
                    <UnitActions workspaceId={workspaceId} unit={unit} options={options} />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <InfoRow icon={ClockIcon} label="Horário de funcionamento">
                  {unit.businessHours.opensAt} às {unit.businessHours.closesAt}
                </InfoRow>
                <InfoRow icon={ArmchairIcon} label="Estações">
                  <div className="flex flex-wrap gap-1">
                    {unit.stations.map((group) => (
                      <Badge key={group.type} variant="secondary">
                        {group.type} × {group.quantity}
                      </Badge>
                    ))}
                  </div>
                </InfoRow>
                <InfoRow icon={UsersIcon} label="Usuários">
                  <UnitMembers ids={unit.workspaceMemberIds} members={options.members} />
                </InfoRow>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
