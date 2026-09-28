"use client"

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { MousePointerClickIcon } from "lucide-react"
import { completeTutorialAction } from "@/lib/actions/tutorial"
import { TOURS, type Tour, type TourAccess, type TourId, type TourStep } from "@/components/tour/tour-steps"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type TourContextValue = {
  tours: { id: TourId; title: string }[]
  start: (id: TourId) => void
}

const TourContext = createContext<TourContextValue | null>(null)

// Fora do provider (ex.: tela de planos) não há tutorial.
export function useTour() {
  return useContext(TourContext)
}

// Tutoriais guiados: escurecem a tela, recortam o elemento da vez e explicam numa caixa ao lado.
// Os passos seguem o uso real do sistema (o clique no destaque navega, o formulário salva).
// O de primeiros passos abre sozinho no primeiro acesso; os das outras áreas ficam no menu do usuário.
export function TourProvider({
  workspaceId,
  access,
  autoStart,
  children,
}: {
  workspaceId: string
  access: TourAccess
  autoStart: boolean
  children: React.ReactNode
}) {
  // Só os passos que a função do usuário enxerga; tutoriais sem nenhum somem.
  const tours = useMemo(
    () =>
      TOURS.filter((tour) => !tour.show || tour.show(access))
        .map((tour) => ({ ...tour, steps: tour.steps.filter((step) => !step.show || step.show(access)) }))
        .filter((tour) => tour.steps.length > 0),
    [access],
  )
  const [current, setCurrent] = useState<{ tourId: TourId; stepId: string } | null>(() => {
    const start = TOURS.find((tour) => tour.id === "start")
    return autoStart && start ? { tourId: "start", stepId: start.steps[0].id } : null
  })
  const tour = current ? tours.find((tour) => tour.id === current.tourId) : undefined
  const index = tour ? tour.steps.findIndex((step) => step.id === current?.stepId) : -1

  const value = useMemo<TourContextValue>(
    () => ({
      tours: tours.map(({ id, title }) => ({ id, title })),
      start: (id) => {
        const tour = tours.find((tour) => tour.id === id)
        if (tour) setCurrent({ tourId: id, stepId: tour.steps[0].id })
      },
    }),
    [tours],
  )

  function finish() {
    if (current?.tourId === "start") void completeTutorialAction()
    setCurrent(null)
  }

  function goTo(next: number) {
    if (!tour) return
    if (next >= tour.steps.length) finish()
    else setCurrent({ tourId: tour.id, stepId: tour.steps[Math.max(next, 0)].id })
  }

  return (
    <TourContext.Provider value={value}>
      {children}
      {tour && index >= 0 && (
        <TourOverlay
          workspaceId={workspaceId}
          tour={tour}
          index={index}
          onGoTo={goTo}
          onSkipTo={(id) => goTo(tour.steps.findIndex((step) => step.id === id))}
          onFinish={finish}
          // No fim dos primeiros passos, os outros tutoriais ficam à mão.
          nextTours={tour.id === "start" ? value.tours.filter((other) => other.id !== "start") : []}
          onStartTour={(id) => {
            finish()
            value.start(id)
          }}
        />
      )}
    </TourContext.Provider>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${value * 100}%` }} />
    </div>
  )
}

// Com missões, um segmento por missão, que enche com os passos já feitos dela.
function TourProgress({ tour, index }: { tour: Tour; index: number }) {
  if (!tour.missions) return <ProgressBar value={(index + 1) / tour.steps.length} />
  return (
    <div className="flex gap-1">
      {tour.missions.map((mission, m) => {
        const steps = tour.steps.flatMap((step, i) => (step.mission === m ? [i] : []))
        const done = steps.filter((i) => i < index).length
        return <ProgressBar key={mission} value={steps.length ? done / steps.length : 0} />
      })}
    </div>
  )
}

type Box = { x: number; y: number; width: number; height: number }

// searching: esperando o destaque aparecer (navegação carregando). missing: demorou demais,
// a caixa vai para o centro com um "Próximo". closing: o formulário fechou e o resultado ainda não veio.
type Frame = {
  stepId: string
  viewport: { width: number; height: number }
  box: Box | null
  status: "searching" | "ready" | "missing" | "closing"
}

const PADDING = 6
const RADIUS = 10
const GAP = 12
const MARGIN = 12
const CARD_WIDTH = 320
const CARD_HEIGHT = 220
const MISSING_MS = 6000
// A lista recarrega depois de salvar; o calendário busca os agendamentos de novo.
const FORM_RESULT_MS = 4000

// O primeiro elemento visível com o data-tour (a mesma marca pode existir em telas escondidas).
function findTarget(name: string) {
  for (const element of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const rect = element.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return element
  }
  return null
}

function sameFrame(a: Frame | null, b: Frame) {
  return (
    !!a &&
    a.stepId === b.stepId &&
    a.status === b.status &&
    a.viewport.width === b.viewport.width &&
    a.viewport.height === b.viewport.height &&
    a.box?.x === b.box?.x &&
    a.box?.y === b.box?.y &&
    a.box?.width === b.box?.width &&
    a.box?.height === b.box?.height
  )
}

// Tela inteira menos um retângulo arredondado; o evenodd faz do retângulo um furo, e
// clip-path também corta os cliques, que passam pelo furo até o elemento destacado.
function holePath(box: Box | null, viewport: Frame["viewport"]) {
  const { x, y, width: w, height: h } = box ?? { x: viewport.width / 2, y: viewport.height / 2, width: 0, height: 0 }
  const r = Math.min(RADIUS, w / 2, h / 2)
  return `path(evenodd, "M0 0H${viewport.width}V${viewport.height}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z")`
}

function cardPosition(box: Box | null, viewport: Frame["viewport"], side: TourStep["side"]): CSSProperties {
  if (!box) return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }
  // No celular a caixa ocupa a largura toda, na metade da tela oposta ao destaque.
  if (viewport.width < 640) {
    const below = box.y + box.height / 2 < viewport.height / 2
    return below ? { left: MARGIN, right: MARGIN, bottom: MARGIN } : { left: MARGIN, right: MARGIN, top: MARGIN }
  }
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), viewport.width - CARD_WIDTH - MARGIN)
  const clampY = (y: number) => Math.max(Math.min(y, viewport.height - CARD_HEIGHT - MARGIN), MARGIN)
  const centerX = clampX(box.x + box.width / 2 - CARD_WIDTH / 2)
  const space = {
    top: box.y - GAP,
    bottom: viewport.height - box.y - box.height - GAP,
    left: box.x - GAP,
    right: viewport.width - box.x - box.width - GAP,
  }
  const sides = [side, "bottom", "top", "right", "left"] as const
  const chosen = sides.find((s) =>
    !s ? false : s === "left" || s === "right" ? space[s] >= CARD_WIDTH + MARGIN : space[s] >= CARD_HEIGHT,
  )
  switch (chosen) {
    case "bottom":
      return { left: centerX, top: box.y + box.height + GAP }
    case "top":
      return { left: centerX, bottom: viewport.height - box.y + GAP }
    case "right":
      return { left: box.x + box.width + GAP, top: clampY(box.y) }
    case "left":
      return { right: viewport.width - box.x + GAP, top: clampY(box.y) }
    default:
      // Destaque grande (ex.: o calendário): a caixa fica por cima, no canto.
      return { right: MARGIN, bottom: MARGIN }
  }
}

const subscribeNothing = () => () => {}

function TourOverlay({
  workspaceId,
  tour,
  index,
  onGoTo,
  onSkipTo,
  onFinish,
  nextTours,
  onStartTour,
}: {
  workspaceId: string
  tour: Tour
  index: number
  onGoTo: (index: number) => void
  onSkipTo: (id: string) => void
  onFinish: () => void
  nextTours: { id: TourId; title: string }[]
  onStartTour: (id: TourId) => void
}) {
  const router = useRouter()
  const { isMobile, setOpenMobile } = useSidebar()
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false)
  const [measured, setMeasured] = useState<Frame | null>(null)
  const step = tour.steps[index]
  // A medição de outro passo ainda não vale: até a primeira do passo atual, está procurando.
  const frame = measured?.stepId === step.id ? measured : null
  const status = step.target ? (frame?.status ?? "searching") : "ready"
  const box = status === "ready" ? (frame?.box ?? null) : null
  const viewport = frame?.viewport ?? measured?.viewport ?? null

  const advance = useEffectEvent(() => onGoTo(index + 1))
  const back = useEffectEvent(() => onGoTo(index - 1))
  const skipTo = useEffectEvent((id: string) => onSkipTo(id))

  // Mede o destaque a cada quadro: acompanha rolagem, animação dos sheets e a troca de página.
  useEffect(() => {
    let request = 0
    let seen = false
    let closedAt: number | null = null
    const startedAt = performance.now()

    const tick = (now: number) => {
      if (step.action === "reveal" && step.expect && findTarget(step.expect)) return advance()
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const element = step.target ? findTarget(step.target) : null
      let next: Frame
      if (element) {
        if (!seen) {
          seen = true
          if (step.skipIf && findTarget(step.skipIf.target)) return skipTo(step.skipIf.to)
          const rect = element.getBoundingClientRect()
          if (rect.top < 0 || rect.bottom > viewport.height) element.scrollIntoView({ block: "center", behavior: "smooth" })
        }
        closedAt = null
        // Com a folga em volta, mas sem passar da tela (itens colados na borda, como a sidebar).
        const rect = element.getBoundingClientRect()
        const left = Math.round(Math.max(rect.left - PADDING, 0))
        const top = Math.round(Math.max(rect.top - PADDING, 0))
        const right = Math.round(Math.min(rect.right + PADDING, viewport.width))
        const bottom = Math.round(Math.min(rect.bottom + PADDING, viewport.height))
        next = { stepId: step.id, viewport, box: { x: left, y: top, width: right - left, height: bottom - top }, status: "ready" }
      } else if (seen && step.action === "form") {
        // Salvou quando o resultado aparece; se não aparecer, o formulário foi cancelado.
        closedAt ??= now
        if (step.expect && findTarget(step.expect)) return advance()
        if (now - closedAt > FORM_RESULT_MS) return back()
        next = { stepId: step.id, viewport, box: null, status: "closing" }
      } else {
        const status = !step.target ? "ready" : now - startedAt > MISSING_MS ? "missing" : "searching"
        next = { stepId: step.id, viewport, box: null, status }
      }
      setMeasured((prev) => (sameFrame(prev, next) ? prev : next))
      request = requestAnimationFrame(tick)
    }

    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [step])

  // Nos passos de clique, o clique segue para o elemento normalmente e o tutorial avança.
  useEffect(() => {
    if (step.action !== "click" || !step.target) return
    const target = step.target
    const onClick = (event: MouseEvent) => {
      const element = findTarget(target)
      if (element && event.target instanceof Node && element.contains(event.target)) advance()
    }
    document.addEventListener("click", onClick, true)
    return () => document.removeEventListener("click", onClick, true)
  }, [step])

  // No celular a sidebar é um sheet: abre nos passos dela e fecha nos outros.
  useEffect(() => {
    if (isMobile) setOpenMobile(!!step.sidebar)
  }, [isMobile, setOpenMobile, step])

  if (!mounted) return null

  const form = step.action === "form"
  const interactive = !!step.action
  const showCard = status === "ready" || status === "missing"
  const intro = index === 0 && !step.target
  const last = index === tour.steps.length - 1
  const missions = tour.missions
  const mission = missions && step.mission !== undefined ? step.mission : null

  function next() {
    if (status === "missing" && step.href) router.push(`/workspace/${workspaceId}${step.href}`)
    onGoTo(index + 1)
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-60" role="dialog" aria-modal="true" aria-label="Tutorial">
      {/* O formulário já vem com o próprio fundo (ou nenhum, no balão do agendamento); aqui só entra a caixa. */}
      {!form && (
        <div
          className="pointer-events-auto absolute inset-0 bg-black/40 backdrop-blur-[3px] transition-[clip-path] duration-300 ease-out"
          style={viewport ? { clipPath: holePath(box, viewport) } : undefined}
        />
      )}
      {/* Nos passos só de leitura o elemento destacado não é clicável. */}
      {box && !interactive && <div className="pointer-events-auto absolute" style={{ left: box.x, top: box.y, width: box.width, height: box.height }} />}
      {box && !form && (
        <div
          className={cn(
            "absolute rounded-[10px] ring-2 ring-primary transition-all duration-300 ease-out",
            interactive && "animate-tour-pulse",
          )}
          style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
        />
      )}
      {(status === "searching" || status === "closing") && !form && (
        <Spinner className="absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-white" />
      )}

      {showCard && viewport && (
        <div
          key={`${step.id}-${status}`}
          // O balão do agendamento não fecha com cliques em elementos marcados assim.
          data-keeps-draft=""
          className="pointer-events-auto absolute grid gap-3 rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 duration-200 sm:w-80"
          style={cardPosition(box, viewport, step.side)}
        >
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="min-w-0 truncate tabular-nums">
              {missions && mission !== null ? (
                <>
                  Missão {mission + 1} de {missions.length} ·{" "}
                  <span className="font-medium text-foreground">{missions[mission]}</span>
                </>
              ) : missions ? (
                tour.title
              ) : (
                `${tour.title} · ${index + 1} de ${tour.steps.length}`
              )}
            </span>
            {!intro && !last && (
              <button type="button" className="shrink-0 hover:text-foreground hover:underline" onClick={onFinish}>
                Sair
              </button>
            )}
          </div>
          <TourProgress tour={tour} index={index} />
          <div className="grid gap-1">
            <h3 className="font-heading text-base font-medium">{step.title}</h3>
            <p className="text-muted-foreground">{step.body}</p>
          </div>
          {last && nextTours.length > 0 && (
            <div className="grid gap-2">
              {nextTours.map((other) => (
                <Button key={other.id} variant="outline" className="justify-start" onClick={() => onStartTour(other.id)}>
                  {other.title}
                </Button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            {intro ? (
              <>
                <Button variant="ghost" onClick={onFinish}>
                  Agora não
                </Button>
                <Button onClick={next}>Começar</Button>
              </>
            ) : interactive && status === "ready" ? (
              <span className="mr-auto flex items-center gap-2 text-xs font-medium text-primary">
                <MousePointerClickIcon className="size-4" />
                {form ? "Salve para continuar" : "Clique no destaque"}
              </span>
            ) : (
              <Button onClick={last ? onFinish : next}>{last ? "Concluir" : "Próximo"}</Button>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
