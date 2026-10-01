"use client"

import { useState } from "react"
import type { TeamCandidate } from "@/lib/unit-team"
import { TherapistAvatar } from "@/components/therapist-avatar"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"
import { Field, FieldLabel } from "@/components/ui/field"

type Props = {
  idPrefix: string
  team: TeamCandidate[]
  // Unidade em edição; ausente ao cadastrar.
  unitId?: string
}

// Escolha com busca de quem trabalha na unidade. Envia um teamMemberId por pessoa escolhida.
export function UnitTeamFields({ idPrefix, team, unitId }: Props) {
  const anchor = useComboboxAnchor()
  const [selected, setSelected] = useState(() => team.filter((member) => !!unitId && member.unitIds.includes(unitId)))

  return (
    <Field>
      <FieldLabel htmlFor={`${idPrefix}-team`}>Equipe</FieldLabel>
      <Combobox
        multiple
        items={team}
        value={selected}
        onValueChange={(next: TeamCandidate[]) => setSelected(next)}
        itemToStringLabel={(member: TeamCandidate) => member.name}
        isItemEqualToValue={(a: TeamCandidate, b: TeamCandidate) => a.id === b.id}
      >
        <ComboboxChips ref={anchor} className="w-full">
          <ComboboxValue>
            {(members: TeamCandidate[]) =>
              members.map((member) => (
                <ComboboxChip key={member.id}>
                  <TherapistAvatar therapist={member} className="size-4" />
                  {member.name}
                </ComboboxChip>
              ))
            }
          </ComboboxValue>
          <ComboboxChipsInput
            id={`${idPrefix}-team`}
            placeholder={selected.length ? "" : "Buscar pessoa da equipe..."}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>
            {team.length ? "Ninguém encontrado." : "Ninguém convidado além dos administradores. Convide em Usuários."}
          </ComboboxEmpty>
          <ComboboxList>
            {(member: TeamCandidate) => (
              <ComboboxItem key={member.id} value={member}>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <TherapistAvatar therapist={member} className="size-6" />
                  <span className="truncate">{member.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {[member.roleName ?? "Sem função", member.pending && "convite pendente"].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {selected.map((member) => (
        <input key={member.id} type="hidden" name="teamMemberId" value={member.id} />
      ))}
    </Field>
  )
}
