"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type TransitionStartFunction } from "react"
import { useLinkStatus } from "next/link"
import { usePathname, useRouter } from "next/navigation"

type NavigationProgress = {
  pending: boolean
  // Marca uma navegação de Link em andamento; a função devolvida desmarca.
  track: () => () => void
  startTransition: TransitionStartFunction
}

const NavigationProgressContext = createContext<NavigationProgress | null>(null)

// Junta as navegações em andamento (filtros que trocam a URL e cliques em Link) num só estado,
// que alimenta a barra de progresso e o esmaecimento do conteúdo.
export function NavigationProgressProvider({ children }: { children: React.ReactNode }) {
  const [transitionPending, startTransition] = useTransition()
  const [links, setLinks] = useState(0)
  const track = useCallback(() => {
    setLinks((n) => n + 1)
    return () => setLinks((n) => n - 1)
  }, [])
  const value = useMemo(
    () => ({ pending: transitionPending || links > 0, track, startTransition }),
    [transitionPending, links, track],
  )

  return (
    <NavigationProgressContext.Provider value={value}>
      {/* contents: o wrapper não entra no layout, só marca o conteúdo para o CSS de pendente. */}
      <div className="contents" data-navigation-pending={value.pending || undefined}>
        {children}
      </div>
    </NavigationProgressContext.Provider>
  )
}

export function useNavigationPending() {
  return useContext(NavigationProgressContext)?.pending ?? false
}

// Troca a query da URL atual dentro de uma transição, para a tela mostrar que está carregando.
// Campos vazios (busca apagada, unidade "todas"...) ficam fora da URL.
export function useReplaceQuery() {
  const router = useRouter()
  const pathname = usePathname()
  const startTransition = useContext(NavigationProgressContext)?.startTransition
  return useCallback(
    (query: Record<string, string>) => {
      const params = new URLSearchParams(Object.entries(query).filter(([, value]) => value))
      const navigate = () => router.replace(`${pathname}?${params}`)
      if (startTransition) startTransition(navigate)
      else navigate()
    },
    [router, pathname, startTransition],
  )
}

// Fica dentro de um Link e avisa o provider enquanto a navegação dele não termina.
export function LinkPendingSignal() {
  const { pending } = useLinkStatus()
  const track = useContext(NavigationProgressContext)?.track
  useEffect(() => {
    if (pending && track) return track()
  }, [pending, track])
  return null
}

// Barra fina e indeterminada no topo; só aparece se a espera passar de um instante.
export function NavigationProgressBar() {
  const pending = useNavigationPending()
  return (
    <div
      aria-hidden
      data-pending={pending || undefined}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden opacity-0 transition-opacity data-pending:opacity-100 data-pending:delay-150"
    >
      <div className="h-full w-1/3 bg-primary motion-safe:animate-progress" />
    </div>
  )
}
