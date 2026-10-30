import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount } from "agendi"

export const Sizes = () => (
  <div className="flex items-center gap-4">
    <Avatar size="sm">
      <AvatarFallback>MS</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>MS</AvatarFallback>
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback>MS</AvatarFallback>
    </Avatar>
  </div>
)

export const ColoredInitials = () => (
  <div className="flex items-center gap-3">
    <Avatar size="lg">
      <AvatarFallback className="bg-rose-100 font-medium text-rose-700">M</AvatarFallback>
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback className="bg-sky-100 font-medium text-sky-700">R</AvatarFallback>
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback className="bg-emerald-100 font-medium text-emerald-700">J</AvatarFallback>
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback className="bg-amber-100 font-medium text-amber-800">C</AvatarFallback>
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback className="bg-violet-100 font-medium text-violet-700">L</AvatarFallback>
    </Avatar>
  </div>
)

export const Group = () => (
  <div className="flex flex-col gap-4">
    <AvatarGroup>
      <Avatar>
        <AvatarFallback className="bg-rose-100 font-medium text-rose-700">M</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-sky-100 font-medium text-sky-700">R</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback className="bg-emerald-100 font-medium text-emerald-700">J</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+4</AvatarGroupCount>
    </AvatarGroup>
    <AvatarGroup>
      <Avatar size="lg">
        <AvatarFallback>AP</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>BC</AvatarFallback>
      </Avatar>
      <Avatar size="lg">
        <AvatarFallback>CD</AvatarFallback>
      </Avatar>
      <AvatarGroupCount>+12</AvatarGroupCount>
    </AvatarGroup>
  </div>
)

export const WithStatus = () => (
  <div className="flex items-center gap-4">
    <Avatar size="sm">
      <AvatarFallback>RL</AvatarFallback>
      <AvatarBadge />
    </Avatar>
    <Avatar>
      <AvatarFallback>RL</AvatarFallback>
      <AvatarBadge />
    </Avatar>
    <Avatar size="lg">
      <AvatarFallback>RL</AvatarFallback>
      <AvatarBadge />
    </Avatar>
  </div>
)

export const UserRow = () => (
  <div className="flex w-64 items-center gap-2 text-sm">
    <Avatar className="size-8 rounded-[0.625rem] after:rounded-[0.625rem]">
      <AvatarFallback className="rounded-[0.625rem] bg-teal-100 font-medium text-teal-700">J</AvatarFallback>
    </Avatar>
    <div className="grid flex-1 text-left text-sm leading-tight">
      <span className="truncate font-medium">Juliana Alves</span>
      <span className="truncate text-xs text-muted-foreground">juliana@studiobela.com.br</span>
    </div>
  </div>
)
