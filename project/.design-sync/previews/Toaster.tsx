import { useEffect } from "react"
import { Toaster } from "agendi"
import { toast } from "sonner"

// Fires toasts once on mount so the card renders them statically.
function Fire({ run }: { run: () => void }) {
  useEffect(() => {
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export const Confirmed = () => (
  <>
    <Toaster position="top-center" richColors />
    <Fire run={() => toast.success("Agendamento confirmado.")} />
  </>
)

export const Variants = () => (
  <>
    <Toaster position="top-center" richColors expand />
    <Fire
      run={() => {
        toast.success("URA salva.")
        toast.info("A última mensagem do cliente não pede resposta.")
        toast.warning("O limite de despesas de Insumos está em 90%.")
        toast.error("A AgenIA falhou. Tente de novo.")
      }}
    />
  </>
)

export const WithDescriptionAndAction = () => (
  <>
    <Toaster position="top-center" richColors />
    <Fire
      run={() =>
        toast("Agendamento cancelado", {
          description: "Mariana Souza · 30/10 às 14:00 · Massagem relaxante",
          action: { label: "Desfazer", onClick: () => {} },
        })
      }
    />
  </>
)

export const Loading = () => (
  <>
    <Toaster position="top-center" richColors />
    <Fire run={() => toast.loading("Exportando relatório de caixa...")} />
  </>
)
