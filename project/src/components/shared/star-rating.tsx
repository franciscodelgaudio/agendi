"use client"

import { useState } from "react"
import { StarIcon } from "lucide-react"
import { cn } from "cn"

const STARS = [1, 2, 3, 4, 5]

// Estrelas só para leitura; null = sem avaliação.
export function StarRating({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className="text-muted-foreground">—</span>

  return (
    <span className={cn("inline-flex gap-0.5", className)} role="img" aria-label={`${value} de 5 estrelas`}>
      {STARS.map((star) => (
        <StarIcon
          key={star}
          className={cn("size-4", star <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
        />
      ))}
    </span>
  )
}

type InputProps = { id?: string; name: string; defaultValue?: number | null }

// Clicar na estrela já marcada limpa a avaliação. Envia "" (sem avaliação) ou "1".."5" num campo oculto.
export function StarRatingInput({ id, name, defaultValue = null }: InputProps) {
  const [value, setValue] = useState(defaultValue)
  const [hover, setHover] = useState<number | null>(null)
  const shown = hover ?? value ?? 0

  return (
    <div id={id} role="group" className="flex items-center gap-1" onMouseLeave={() => setHover(null)}>
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} ${star === 1 ? "estrela" : "estrelas"}`}
          aria-pressed={value === star}
          className="rounded-sm p-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onMouseEnter={() => setHover(star)}
          onClick={() => setValue(value === star ? null : star)}
        >
          <StarIcon
            className={cn(
              "size-6 transition-colors",
              star <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
      <input type="hidden" name={name} value={value ?? ""} />
    </div>
  )
}
