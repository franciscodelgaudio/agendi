"use client"

import { useRef, useState } from "react"

import { FieldHelp, OptionalMark } from "@/components/shared/field-hints"
import { InitialFallback } from "@/components/shared/initial-fallback"
import { Avatar, AvatarGroup, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"

export type MemberOption = { id: string; name: string; image: string | null }

function MemberAvatar({ member }: { member: MemberOption }) {
  return (
    <Avatar size="sm">
      {member.image && <AvatarImage src={member.image} alt={member.name} />}
      <InitialFallback name={member.name} />
    </Avatar>
  )
}

function selectionLabel(selected: MemberOption[]) {
  if (selected.length === 0) return "Selecione os membros"
  if (selected.length <= 2) return selected.map((member) => member.name).join(", ")
  return `${selected.length} membros selecionados`
}

export function UnitMemberFields({ members, defaultValue }: { members: MemberOption[]; defaultValue?: string[] }) {
  const [selected, setSelected] = useState(() => members.filter((member) => defaultValue?.includes(member.id)))
  const anchorRef = useRef<HTMLDivElement>(null)

  return (
    <Field>
      <div className="flex items-center gap-1.5">
        <FieldLabel>
          Membros <OptionalMark />
        </FieldLabel>
        <FieldHelp>Os membros que realizam atendimentos aparecem na agenda desta unidade.</FieldHelp>
      </div>
      {members.length === 0 ? (
        <FieldDescription>Nenhum membro no workspace ainda.</FieldDescription>
      ) : (
        <Combobox
          multiple
          items={members}
          value={selected}
          onValueChange={setSelected}
          itemToStringLabel={(member: MemberOption) => member.name}
          isItemEqualToValue={(a: MemberOption, b: MemberOption) => a.id === b.id}
        >
          <div ref={anchorRef}>
            <ComboboxTrigger render={<Button variant="outline" className="w-full justify-between font-normal" />}>
              <span className="flex min-w-0 items-center gap-2">
                {selected.length > 0 && (
                  <AvatarGroup className="-space-x-1.5">
                    {selected.slice(0, 3).map((member) => (
                      <MemberAvatar key={member.id} member={member} />
                    ))}
                  </AvatarGroup>
                )}
                <span className={selected.length ? "truncate" : "truncate text-muted-foreground"}>
                  {selectionLabel(selected)}
                </span>
              </span>
            </ComboboxTrigger>
          </div>
          <ComboboxContent anchor={anchorRef}>
            <ComboboxInput showTrigger={false} placeholder="Buscar membro..." />
            <ComboboxEmpty>Ninguém encontrado.</ComboboxEmpty>
            <ComboboxList>
              {(member: MemberOption) => (
                <ComboboxItem key={member.id} value={member}>
                  <span className="flex min-w-0 items-center gap-2">
                    <MemberAvatar member={member} />
                    <span className="truncate">{member.name}</span>
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
      {selected.map((member) => (
        <input key={member.id} type="hidden" name="workspaceMemberId" value={member.id} />
      ))}
    </Field>
  )
}
