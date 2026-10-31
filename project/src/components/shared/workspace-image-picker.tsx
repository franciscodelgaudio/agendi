"use client"

import { useRef, useState } from "react"
import { UploadIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { ACCEPTED_IMAGE_TYPES, type ImageUpload } from "@/components/shared/image-upload-field"
import { cn } from "@/service/_shared/utils"

type Props = {
  image: ImageUpload
  name: string
  size?: "md" | "lg"
  children?: React.ReactNode
}

export function WorkspaceImagePicker({ image, name, size = "md", children }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const depth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const pick = () => fileRef.current?.click()
  const large = size === "lg"

  const receive = (file: File | undefined) => {
    if (file && !image.uploading) void image.upload(file)
  }

  return (
    <div
      className={cn("relative flex items-center border border-dashed", large ? "gap-6 p-5" : "gap-4 p-4")}
      onDragEnter={(event) => {
        event.preventDefault()
        depth.current += 1
        if (!image.uploading) setDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = "copy"
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        depth.current = 0
        setDragging(false)
        receive(event.dataTransfer.files[0])
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute -inset-px z-10 flex items-center justify-center gap-2 border border-dashed border-primary bg-[color-mix(in_oklch,var(--background)_88%,var(--primary))] text-sm font-medium text-foreground">
          <UploadIcon className="size-4" />
          Solte a imagem aqui
        </div>
      )}
      <button
        type="button"
        onClick={pick}
        disabled={image.uploading}
        aria-label="Escolher imagem"
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden border bg-primary font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          large ? "size-30 text-5xl" : "size-20 text-3xl",
        )}
      >
        {image.shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.shown} alt="" className="size-full object-cover" />
        ) : (
          <span>{name.charAt(0).toUpperCase()}</span>
        )}
        {image.uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Spinner className="size-5 text-foreground" />
          </span>
        )}
      </button>
      <div className={cn("flex min-w-0 flex-col", large ? "gap-3" : "gap-2")}>
        {children}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={pick} loading={image.uploading}>
            <UploadIcon />
            {image.uploading ? "Enviando..." : image.url ? "Trocar imagem" : "Enviar imagem"}
          </Button>
          {image.url && !image.uploading && (
            <Button type="button" variant="ghost" size="sm" onClick={() => image.setUrl("")}>
              Remover
            </Button>
          )}
        </div>
        {image.error ? (
          <span role="alert" className="text-xs text-pretty text-destructive">
            {image.error}
          </span>
        ) : (
          <span className="text-xs text-pretty text-muted-foreground">
            Ou arraste uma imagem para cá. PNG, JPG ou WebP até 5 MB, de preferência quadrada.
          </span>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          receive(file)
        }}
      />
      <input type="hidden" name="imageUrl" value={image.url} />
    </div>
  )
}
