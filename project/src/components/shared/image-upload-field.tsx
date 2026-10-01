"use client"

import { useEffect, useState } from "react"
import { ImagePlusIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { FileDropzone } from "@/components/ui/file-dropzone"
import { Spinner } from "@/components/ui/spinner"
import { MAX_IMAGE_BYTES } from "@/service/workspace/[workspaceId]/uploads/image-upload"

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"]

type Props = {
  id: string
  label: string
  workspaceId: string
  // Define a pasta no bucket e a permissão conferida no servidor.
  target: "workspace" | "unit" | "product"
  unitId?: string
  defaultValue?: string | null
}

// Envia a imagem ao escolher/arrastar/colar o arquivo e guarda a URL pública no campo avatarUrl do formulário.
export function ImageUploadField({ id, label, workspaceId, target, unitId, defaultValue }: Props) {
  const [url, setUrl] = useState(defaultValue ?? "")
  // Prévia local enquanto o envio não termina.
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const uploading = preview !== null

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  async function upload(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) return setError("Envie uma imagem JPG, PNG ou WebP.")
    if (file.size > MAX_IMAGE_BYTES) return setError("A imagem pode ter no máximo 5 MB.")

    setPreview(URL.createObjectURL(file))
    setError(null)
    const body = new FormData()
    body.set("file", file)
    body.set("target", target)
    if (unitId) body.set("unitId", unitId)
    try {
      const response = await fetch(`/api/workspace/${workspaceId}/uploads`, { method: "POST", body })
      const data = (await response.json()) as { url?: string; error?: string }
      if (data.url) setUrl(data.url)
      else setError(data.error ?? "Não foi possível enviar a imagem. Tente novamente.")
    } catch (error) {
      console.error("Falha no envio da imagem", error)
      setError("Não foi possível enviar a imagem. Tente novamente.")
    } finally {
      setPreview(null)
    }
  }

  const shown = preview ?? url

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FileDropzone
        id={id}
        accept={ACCEPTED_TYPES.join(",")}
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
      <input type="hidden" name="avatarUrl" value={url} />
      {error && <FieldError>{error}</FieldError>}
    </Field>
  )
}
