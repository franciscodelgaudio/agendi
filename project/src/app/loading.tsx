import Image from "next/image"
import { Spinner } from "@/components/ui/spinner"

// Tela de carregamento de entrada: aparece ao abrir o app e ao entrar num workspace, antes de
// existir moldura para os skeletons.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-svh flex-1 flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-2 text-2xl font-semibold tracking-tight motion-safe:animate-pulse">
        <Image src="/logo.svg" alt="" width={40} height={40} loading="eager" />
        agendi
      </div>
      <Spinner className="size-5 text-muted-foreground" aria-hidden />
      <span className="sr-only">Carregando...</span>
    </div>
  )
}
