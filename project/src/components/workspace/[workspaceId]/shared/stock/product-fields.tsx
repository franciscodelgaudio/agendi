import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AmountInput } from "@/components/shared/amount-input"
import { StarRatingInput } from "@/components/shared/star-rating"
import { ImageUploadField } from "@/components/shared/image-upload-field"

type Props = {
  idPrefix: string
  workspaceId: string
  // Sem quantidade: edição no catálogo do workspace, que não é de nenhum estoque.
  withQuantity?: boolean
  defaultValues?: {
    name: string
    quantity?: number
    costCents: number
    notes: string | null
    rating: number | null
    avatarUrl: string | null
  }
}

export function ProductFields({ idPrefix, workspaceId, withQuantity = true, defaultValues }: Props) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Nome</FieldLabel>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          placeholder="Óleo de amêndoas"
          defaultValue={defaultValues?.name}
          maxLength={80}
          autoFocus
          required
        />
      </Field>
      {withQuantity && (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-quantity`}>Quantidade</FieldLabel>
          <Input
            id={`${idPrefix}-quantity`}
            name="quantity"
            type="number"
            inputMode="numeric"
            min={0}
            max={1_000_000}
            step={1}
            placeholder="10"
            defaultValue={defaultValues?.quantity}
            required
          />
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-cost`}>Preço de custo</FieldLabel>
        <AmountInput
          id={`${idPrefix}-cost`}
          name="cost"
          max={100_000_000}
          placeholder="R$ 45,90"
          defaultValue={defaultValues?.costCents}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-rating`}>Avaliação (opcional)</FieldLabel>
        <StarRatingInput id={`${idPrefix}-rating`} name="rating" defaultValue={defaultValues?.rating} />
        <FieldDescription>Clique na estrela marcada para limpar.</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-notes`}>Observações (opcional)</FieldLabel>
        <Textarea
          id={`${idPrefix}-notes`}
          name="notes"
          placeholder="Fornecedor, validade, onde fica guardado..."
          defaultValue={defaultValues?.notes ?? undefined}
          maxLength={500}
        />
      </Field>
      <ImageUploadField
        id={`${idPrefix}-image`}
        label="Imagem (opcional)"
        workspaceId={workspaceId}
        target="product"
        defaultValue={defaultValues?.avatarUrl}
      />
    </>
  )
}
