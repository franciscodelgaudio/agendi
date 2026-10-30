import { Button, Field, FieldError, FieldLabel, FileDropzone, Spinner } from "agendi"
import { ImagePlusIcon, Trash2Icon } from "lucide-react"

const noop = () => {}

const Hint = () => <span className="text-xs text-muted-foreground">JPG, PNG ou WebP · até 5 MB</span>

const Placeholder = () => (
  <div className="flex size-20 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
    <ImagePlusIcon className="size-6" />
  </div>
)

export const Empty = () => (
  <div className="w-96">
    <Field>
      <FieldLabel htmlFor="fd-empty">Logo da unidade</FieldLabel>
      <FileDropzone
        id="fd-empty"
        accept="image/jpeg,image/png,image/webp"
        onFile={noop}
        className="items-center gap-4 p-3"
      >
        {() => (
          <>
            <Placeholder />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
              <span className="font-medium">Arraste uma imagem ou clique para escolher</span>
              <Hint />
            </div>
          </>
        )}
      </FileDropzone>
    </Field>
  </div>
)

export const WithImage = () => (
  <div className="w-96">
    <Field>
      <FieldLabel htmlFor="fd-image">Logo da unidade</FieldLabel>
      <FileDropzone id="fd-image" onFile={noop} className="items-center gap-4 p-3">
        {() => (
          <>
            <div className="flex size-20 shrink-0 items-center justify-center rounded-md bg-primary text-2xl font-semibold text-primary-foreground">
              SB
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
              <span className="font-medium">Arraste ou clique para trocar</span>
              <Hint />
            </div>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Remover imagem">
              <Trash2Icon />
            </Button>
          </>
        )}
      </FileDropzone>
    </Field>
  </div>
)

export const Dragging = () => (
  <div className="w-96">
    <Field>
      <FieldLabel htmlFor="fd-drag">Foto do profissional</FieldLabel>
      <FileDropzone id="fd-drag" onFile={noop} data-dragging="true" className="items-center gap-4 p-3">
        {() => (
          <>
            <Placeholder />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
              <span className="font-medium">Solte para enviar</span>
              <Hint />
            </div>
          </>
        )}
      </FileDropzone>
    </Field>
  </div>
)

export const Uploading = () => (
  <div className="w-96">
    <Field>
      <FieldLabel htmlFor="fd-up">Foto do produto</FieldLabel>
      <FileDropzone id="fd-up" onFile={noop} disabled className="items-center gap-4 p-3">
        {() => (
          <>
            <div className="relative flex size-20 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <ImagePlusIcon className="size-6" />
              <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Spinner className="size-5 text-foreground" />
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
              <span className="font-medium">Enviando...</span>
              <Hint />
            </div>
          </>
        )}
      </FileDropzone>
    </Field>
  </div>
)

export const Invalid = () => (
  <div className="w-96">
    <Field data-invalid="true">
      <FieldLabel htmlFor="fd-inv">Logo da unidade</FieldLabel>
      <FileDropzone
        id="fd-inv"
        onFile={noop}
        aria-invalid="true"
        className="items-center gap-4 p-3 aria-invalid:border-destructive"
      >
        {() => (
          <>
            <Placeholder />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm text-foreground">
              <span className="font-medium">Arraste uma imagem ou clique para escolher</span>
              <Hint />
            </div>
          </>
        )}
      </FileDropzone>
      <FieldError>A imagem pode ter no máximo 5 MB.</FieldError>
    </Field>
  </div>
)
