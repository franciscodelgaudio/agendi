import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ImageUploadField } from "@/components/shared/image-upload-field"
import { BusinessHoursFields } from "@/components/workspace/[workspaceId]/unit/business-hours-fields"
import { StationFields, type StationOption } from "@/components/workspace/[workspaceId]/unit/station-fields"
import { UnitMemberFields, type MemberOption } from "@/components/workspace/[workspaceId]/unit/unit-member-fields"
import { UnitRefFields, type RefOption } from "@/components/workspace/[workspaceId]/unit/unit-ref-fields"
import type { BusinessHours } from "@/service/workspace/[workspaceId]/unit/[unitId]/business-hours"

export type UnitFormValues = {
  id: string
  name: string
  imageUrl: string | null
  stations: StationOption[]
  workspaceMemberIds: string[]
  businessHours: BusinessHours
  walletId: string
  inventoryId: string
}

export type UnitFormOptions = { members: MemberOption[]; wallets: RefOption[]; inventories: RefOption[] }

type Props = {
  idPrefix: string
  workspaceId: string
  options: UnitFormOptions
  defaultValues?: UnitFormValues
}

export function UnitFields({ idPrefix, workspaceId, options, defaultValues }: Props) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Nome</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          placeholder="Unidade Centro"
          defaultValue={defaultValues?.name}
          maxLength={80}
          autoFocus
          required
        />
      </Field>
      <ImageUploadField
        id={`${idPrefix}-image`}
        label="Imagem (opcional)"
        name="imageUrl"
        workspaceId={workspaceId}
        target="unit"
        defaultValue={defaultValues?.imageUrl}
      />
      <BusinessHoursFields idPrefix={idPrefix} defaultValue={defaultValues?.businessHours} />
      <StationFields idPrefix={idPrefix} defaultValue={defaultValues?.stations} />
      <UnitMemberFields members={options.members} defaultValue={defaultValues?.workspaceMemberIds} />
      <UnitRefFields
        idPrefix={idPrefix}
        wallets={options.wallets}
        inventories={options.inventories}
        defaultWalletId={defaultValues?.walletId}
        defaultInventoryId={defaultValues?.inventoryId}
      />
    </>
  )
}
