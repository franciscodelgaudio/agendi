"use client"

import { useReplaceQuery } from "@/components/shared/navigation-progress"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { TherapistLabel, TherapistSelectValue, type TherapistOption } from "@/components/workspace/[workspaceId]/shared/team/therapist-avatar"

const ALL = "all"

type Props = {
  query: { member: string } & Record<string, string>
  therapists: TherapistOption[]
}

export function TherapistFilter({ query, therapists }: Props) {
  const replaceQuery = useReplaceQuery()
  const items = [
    { value: ALL, label: "Todos os profissionais" },
    ...therapists.map((therapist) => ({ value: therapist.id, label: therapist.name })),
  ]

  return (
    <Select
      items={items}
      value={query.member || ALL}
      onValueChange={(value) => {
        const member = value === ALL ? "" : (value as string)
        replaceQuery({ ...query, member })
      }}
    >
      <SelectTrigger className="w-full sm:w-56" aria-label="Filtrar por profissional">
        <TherapistSelectValue therapists={therapists} fallback="Todas as profissionais" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todos os profissionais</SelectItem>
        {therapists.map((therapist) => (
          <SelectItem key={therapist.id} value={therapist.id}>
            <TherapistLabel therapist={therapist} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
