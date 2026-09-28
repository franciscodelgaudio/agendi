"use client"

import { useState } from "react"
import {
  CarIcon,
  DropletIcon,
  FileTextIcon,
  FolderIcon,
  GraduationCapIcon,
  HandshakeIcon,
  HeartPulseIcon,
  HouseIcon,
  LandmarkIcon,
  MegaphoneIcon,
  PackageIcon,
  ReceiptIcon,
  ShieldIcon,
  ShoppingCartIcon,
  SmartphoneIcon,
  SparklesIcon,
  TagIcon,
  UsersIcon,
  UtensilsIcon,
  WifiIcon,
  WrenchIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"
import type { ExpenseGroupIcon } from "@/lib/expense-group-icon"
import { cn } from "@/lib/utils"

// Desenho de cada key do catálogo; key desconhecida cai na pasta.
const ICONS: Record<string, LucideIcon> = {
  receipt: ReceiptIcon,
  package: PackageIcon,
  house: HouseIcon,
  zap: ZapIcon,
  droplet: DropletIcon,
  wifi: WifiIcon,
  users: UsersIcon,
  megaphone: MegaphoneIcon,
  wrench: WrenchIcon,
  sparkles: SparklesIcon,
  car: CarIcon,
  utensils: UtensilsIcon,
  landmark: LandmarkIcon,
  shield: ShieldIcon,
  "graduation-cap": GraduationCapIcon,
  "shopping-cart": ShoppingCartIcon,
  smartphone: SmartphoneIcon,
  "file-text": FileTextIcon,
  "heart-pulse": HeartPulseIcon,
  tag: TagIcon,
  // Só do grupo automático de repasse, fora do catálogo.
  handshake: HandshakeIcon,
}

// Quadrado na cor do ícone com o desenho em branco; sem ícone, fica neutro.
export function ExpenseGroupIconBadge({ icon, className }: { icon: ExpenseGroupIcon | null; className?: string }) {
  const Icon = (icon && ICONS[icon.key]) ?? FolderIcon
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center text-white [&_svg]:size-4",
        !icon && "bg-muted text-muted-foreground",
        className,
      )}
      style={icon ? { backgroundColor: icon.color } : undefined}
      title={icon?.name}
    >
      <Icon />
    </span>
  )
}

// Nome do grupo com o ícone pequeno na frente, para listas e seletores.
export function ExpenseGroupLabel({ group }: { group: { name: string; icon: ExpenseGroupIcon | null } }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ExpenseGroupIconBadge icon={group.icon} className="size-5 [&_svg]:size-3" />
      <span className="truncate">{group.name}</span>
    </span>
  )
}

export function ExpenseGroupIconPicker({
  icons,
  name,
  defaultValue,
  labelledBy,
}: {
  icons: ExpenseGroupIcon[]
  name: string
  defaultValue?: string | null
  labelledBy: string
}) {
  const [value, setValue] = useState(
    icons.some((icon) => icon.id === defaultValue) ? defaultValue! : (icons[0]?.id ?? ""),
  )

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {icons.map((icon) => (
        <label key={icon.id} title={icon.name} className="relative cursor-pointer">
          <input
            type="radio"
            name={name}
            value={icon.id}
            checked={value === icon.id}
            onChange={() => setValue(icon.id)}
            aria-label={icon.name}
            className="peer sr-only"
          />
          <ExpenseGroupIconBadge
            icon={icon}
            className="size-9 ring-offset-2 ring-offset-background peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
          />
        </label>
      ))}
    </div>
  )
}
