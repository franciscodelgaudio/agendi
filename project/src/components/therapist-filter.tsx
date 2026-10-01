"use client"

import { useReplaceQuery } from "@/components/navigation-progress"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { TherapistLabel, TherapistSelectValue, type TherapistOption } from "@/components/therapist-avatar"

const ALL = "all"

type Props = {
  // therapist vazio = todas; os demais campos da query são preservados na URL.
  query: { therapist: string } & Record<string, string>
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
      value={query.therapist || ALL}
      onValueChange={(value) => {
        const therapist = value === ALL ? "" : (value as string)
        replaceQuery({ ...query, therapist })
      }}
    >
      <SelectTrigger className="w-full sm:w-56" aria-label="Filtrar por profissional">
        <TherapistSelectValue therapists={therapists} fallback="Todos os profissionais" />
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
