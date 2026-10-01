import { CircleAlertIcon } from "lucide-react"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/shared/initial-fallback"
import { SelectValue } from "@/components/ui/select"
import { cn } from "cn"

export type TherapistOption = { id: string; name: string; image: string | null }

// Foto do profissional; sem foto, a inicial do nome.
export function TherapistAvatar({
  therapist,
  size = "sm",
  className,
  style,
}: {
  therapist: Pick<TherapistOption, "name" | "image">
  size?: "sm" | "default"
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <Avatar size={size} className={className} style={style}>
      {therapist.image && <AvatarImage src={therapist.image} alt={therapist.name} />}
      <InitialFallback name={therapist.name} />
    </Avatar>
  )
}

// No lugar do avatar, em agendamentos cujo profissional não está mais entre os do workspace.
export function MissingTherapistIcon({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Profissional não está mais no workspace"
      title="Profissional não está mais no workspace"
      className={cn("flex items-center justify-center rounded-full bg-amber-400 text-amber-950", className)}
    >
      <CircleAlertIcon className="size-[85%]" />
    </span>
  )
}

// Avatar e nome lado a lado, para itens de select e legendas.
export function TherapistLabel({ therapist, className }: { therapist: TherapistOption; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <TherapistAvatar therapist={therapist} className="size-5" />
      <span className="truncate">{therapist.name}</span>
    </span>
  )
}

// Valor do select de profissional com o avatar; fallback aparece para valores fora da lista
// (ex.: "todas" no filtro) e, sem ele, o placeholder.
export function TherapistSelectValue({
  therapists,
  placeholder,
  fallback,
}: {
  therapists: TherapistOption[]
  placeholder?: string
  fallback?: string
}) {
  return (
    <SelectValue>
      {(value: string | null) => {
        const therapist = therapists.find((option) => option.id === value)
        if (therapist) return <TherapistLabel therapist={therapist} />
        return fallback ?? placeholder
      }}
    </SelectValue>
  )
}
