"use client"

import { useEffect, useState } from "react"
import { ImagePlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { FileDropzone } from "@/components/ui/file-dropzone"
import { Spinner } from "@/components/ui/spinner"
import { MAX_IMAGE_BYTES } from "@/service/workspace/[workspaceId]/uploads/image-upload"

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]

type UploadOptions = {
  workspaceId: string
  // Define a pasta no bucket e a permissão conferida no servidor.
  target: "workspace" | "unit" | "product"
  unitId?: string
  defaultValue?: string | null
}

type Props = UploadOptions & {
  id: string
  label: string
  name?: string
}

export function imageFileError(file: File) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return "Envie uma imagem JPG, PNG ou WebP."
  if (file.size > MAX_IMAGE_BYTES) return "A imagem pode ter no máximo 5 MB."
  return null
}

export async function sendImage(file: File, { workspaceId, target, unitId }: Omit<UploadOptions, "defaultValue">) {
  const body = new FormData()
  body.set("file", file)
  body.set("target", target)
  if (unitId) body.set("unitId", unitId)
  try {
    const response = await fetch(`/api/workspace/${workspaceId}/uploads`, { method: "POST", body })
    const data = (await response.json()) as { url?: string; error?: string }
    return data.url ? { url: data.url } : { error: data.error ?? "Não foi possível enviar a imagem. Tente novamente." }
  } catch (error) {
    console.error("Falha no envio da imagem", error)
    return { error: "Não foi possível enviar a imagem. Tente novamente." }
  }
}

export function useImageUpload({ workspaceId, target, unitId, defaultValue }: UploadOptions) {
  const [url, setUrl] = useState(defaultValue ?? "")
  // Prévia local enquanto o envio não termina.
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const uploading = preview !== null

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  async function upload(file: File) {
    const invalid = imageFileError(file)
    if (invalid) return setError(invalid)

    setPreview(URL.createObjectURL(file))
    setError(null)
    const result = await sendImage(file, { workspaceId, target, unitId })
    if (result.url) setUrl(result.url)
    else setError(result.error ?? null)
    setPreview(null)
  }

  return { url, setUrl, shown: preview ?? url, error, uploading, upload }
}

export type ImageUpload = {
  url: string
  setUrl: (url: string) => void
  shown: string
  error: string | null
  uploading: boolean
  upload: (file: File) => Promise<void>
}

// Envia a imagem ao escolher/arrastar/colar o arquivo e guarda a URL pública no campo avatarUrl do formulário.
export function ImageUploadField({ id, label, name = "avatarUrl", ...options }: Props) {
  const { url, setUrl, shown, error, uploading, upload } = useImageUpload(options)

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FileDropzone
        id={id}
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        disabled={uploading}
        onFile={upload}
        aria-invalid={error ? true : undefined}
        className="items-center gap-4 p-3 aria-invalid:border-destructive"
      >
        {({ dragging }) => (
          <>
            <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
              {shown ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shown} alt="" className="size-full object-contain" />
              ) : (
                <ImagePlusIcon className="size-6" />
              )}
              {uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <Spinner className="size-5 text-foreground" />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
              <span className="font-medium">
                {uploading
                  ? "Enviando..."
                  : dragging
                    ? "Solte para enviar"
                    : url
                      ? "Arraste ou clique para trocar"
                      : "Arraste uma imagem ou clique para escolher"}
              </span>
              <span className="text-xs text-muted-foreground">JPG, PNG ou WebP · até 5 MB</span>
            </div>
            {url && !uploading && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remover imagem"
                onClick={(event) => {
                  event.stopPropagation()
                  setUrl("")
                }}
              >
                <Trash2Icon />
              </Button>
            )}
          </>
        )}
      </FileDropzone>
      <input type="hidden" name={name} value={url} />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
