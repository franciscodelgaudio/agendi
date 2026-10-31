"use client"

import { useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { FieldDescription, FieldSeparator } from "@/components/ui/field"
import { Label } from "@/components/ui/label"

export type MemberOption = { id: string; name: string }

export function UnitMemberFields({ members, defaultValue }: { members: MemberOption[]; defaultValue?: string[] }) {
  const [selected, setSelected] = useState(() => new Set(defaultValue ?? []))

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <>
      <FieldSeparator>Membros</FieldSeparator>
      {members.length === 0 ? (
        <FieldDescription>Nenhum membro no workspace ainda.</FieldDescription>
      ) : (
        <div className="divide-y border">
          {members.map((member) => (
            <Label key={member.id} className="flex items-center gap-2 p-3 font-normal">
              <Checkbox checked={selected.has(member.id)} onCheckedChange={(checked) => toggle(member.id, checked)} />
              <span className="truncate">{member.name}</span>
            </Label>
          ))}
        </div>
      )}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="workspaceMemberId" value={id} />
      ))}
      <FieldDescription>Os membros que realizam atendimentos aparecem na agenda desta unidade.</FieldDescription>
    </>
  )
}
