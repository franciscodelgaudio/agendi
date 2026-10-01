import { AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/service/_shared/utils"

// Classes literais para o Tailwind encontrá-las no código.
const COLORS = [
  "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
]

// A cor sai do nome, e não de um sorteio a cada render: parece aleatória, mas o mesmo
// nome tem sempre a mesma cor (e servidor e cliente concordam).
function colorFor(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) | 0
  return COLORS[Math.abs(hash) % COLORS.length]
}

// Inicial do nome sobre uma cor própria, para avatares sem imagem.
export function InitialFallback({ name, className }: { name: string; className?: string }) {
  return (
    <AvatarFallback className={cn("font-medium", colorFor(name), className)}>
      {name.charAt(0).toUpperCase()}
    </AvatarFallback>
  )
}
