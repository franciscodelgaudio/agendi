"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "lucide-react"
import { logoutAction } from "@/lib/actions/auth"
import { createWorkspaceAction, updateWorkspaceAction } from "@/lib/actions/workspace"
import { imageFileError, sendImage, type ImageUpload } from "@/components/shared/image-upload-field"
import { WorkspaceImagePicker } from "@/components/shared/workspace-image-picker"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/service/_shared/utils"

const TASKS = ["Criando o workspace", "Preparando a agenda", "Ajustando permissões da equipe"]
const TASK_DELAYS = [900, 1900, 3000]
const MIN_SETUP_MS = 3800

function nameForm(name: string, imageUrl?: string) {
  const formData = new FormData()
  formData.set("name", name)
  if (imageUrl) formData.set("imageUrl", imageUrl)
  return formData
}

const stepIn = "animate-in fade-in slide-in-from-bottom-3 duration-500 ease-out motion-reduce:slide-in-from-bottom-0"

function useLocalImage(): ImageUpload & { file: File | null } {
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  return {
    file,
    url,
    shown: url,
    error,
    uploading: false,
    setUrl: (next: string) => {
      setUrl(next)
      if (!next) setFile(null)
    },
    upload: async (next: File) => {
      const invalid = imageFileError(next)
      setError(invalid)
      if (invalid) return
      setFile(next)
      setUrl(URL.createObjectURL(next))
    },
  }
}

export function WorkspaceOnboarding() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState("")
  const [phase, setPhase] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const image = useLocalImage()
  const trimmed = name.trim()

  useEffect(() => {
    if (step !== 3) return
    const timers = TASK_DELAYS.map((ms, i) => setTimeout(() => setPhase(i + 1), ms))
    return () => timers.forEach(clearTimeout)
  }, [step])

  async function setup() {
    const created = await createWorkspaceAction(nameForm(trimmed))
    if (created.error !== null) return created
    if (image.file) {
      const sent = await sendImage(image.file, { workspaceId: created.workspaceId, target: "workspace" })
      if (sent.url) await updateWorkspaceAction(created.workspaceId, { error: null }, nameForm(trimmed, sent.url))
    }
    return created
  }

  async function finish() {
    setPhase(0)
    setError(null)
    setStep(3)
    const [result] = await Promise.all([setup(), new Promise((resolve) => setTimeout(resolve, MIN_SETUP_MS))])
    if (result.error !== null) {
      setError(result.error)
      setStep(1)
      return
    }
    router.replace(`/workspace/${result.workspaceId}`)
  }

  return (
    <div className="flex min-h-svh flex-col bg-background px-6 py-6 md:px-10">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <Image src="/logo.svg" alt="Agendi" width={28} height={28} loading="eager" />
        {step < 3 ? (
          <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
            <div className="flex gap-1">
              <span className="h-[3px] w-8 bg-primary" />
              <span className={cn("h-[3px] w-8 transition-colors duration-500", step === 2 ? "bg-primary" : "bg-border")} />
            </div>
            <span>Etapa {step} de 2</span>
          </div>
        ) : (
          <span />
        )}
        <form action={logoutAction} className="flex justify-end">
          <Button type="submit" variant="ghost" size="sm">
            Sair
          </Button>
        </form>
      </header>

      <main className="flex flex-1 items-center justify-center pt-12 pb-[15vh]">
        {step === 1 && (
          <form
            key="step-1"
            className={cn("flex w-full max-w-[480px] flex-col gap-10", stepIn)}
            onSubmit={(event) => {
              event.preventDefault()
              if (trimmed) setStep(2)
            }}
          >
            <div className="flex flex-col gap-2">
              <h1 className="text-[32px] leading-tight font-semibold tracking-tight">Vamos começar</h1>
              <p className="text-base text-pretty text-muted-foreground">
                Antes de mais nada, escreva o nome do seu negócio.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <input
                aria-label="Nome do negócio"
                placeholder="Ex.: Studio Aurora"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                autoFocus
                autoComplete="off"
                className="w-full border-0 border-b bg-transparent py-2 text-[28px] font-medium tracking-tight text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary"
              />
              {error ? (
                <span role="alert" className="text-xs text-destructive">
                  {error}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Você pode alterar depois.</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" size="lg" disabled={!trimmed}>
                Continuar
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
              <span className="text-xs text-muted-foreground">ou pressione Enter ↵</span>
            </div>
          </form>
        )}

        {step === 2 && (
          <div key="step-2" className={cn("flex w-full max-w-[480px] flex-col gap-10", stepIn)}>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="mb-2 flex items-center gap-1 self-start text-[13px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeftIcon className="size-3.5" />
                Voltar
              </button>
              <h1 className="text-[32px] leading-tight font-semibold tracking-tight">
                Agora, coloque uma imagem do seu negócio
              </h1>
              <p className="text-base text-pretty text-muted-foreground">
                Pode ser o logo ou uma foto do espaço. É opcional.
              </p>
            </div>
            <WorkspaceImagePicker image={image} name={trimmed} size="lg">
              <span className="truncate text-lg font-medium">{trimmed}</span>
            </WorkspaceImagePicker>
            <div className="flex items-center gap-2">
              {image.url ? (
                <Button size="lg" onClick={finish}>
                  Concluir
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              ) : (
                <Button size="lg" variant="outline" onClick={finish}>
                  Pular por enquanto
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div key="step-3" className={cn("flex w-full max-w-[360px] flex-col items-center gap-8 text-center", stepIn)}>
            <div className="flex size-18 items-center justify-center overflow-hidden bg-primary text-[30px] font-medium text-primary-foreground">
              {image.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image.url} alt="" className="size-full object-cover" />
              ) : (
                <span>{trimmed.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Configurando seu ambiente de trabalho</h1>
              <p className="text-sm text-muted-foreground">Isso leva só alguns segundos.</p>
            </div>
            <div className="h-[3px] w-full overflow-hidden bg-border">
              <div
                className="h-full origin-left bg-primary transition-transform duration-1000 ease-out"
                style={{ transform: `scaleX(${phase / TASKS.length})` }}
              />
            </div>
            <ul className="flex w-full flex-col gap-3 text-left text-sm">
              {TASKS.slice(0, phase + 1).map((label, i) => {
                const done = i < phase
                return (
                  <li key={label} className="flex animate-in items-center gap-2.5 duration-300 fade-in slide-in-from-bottom-1">
                    {done ? (
                      <span className="flex size-[18px] items-center justify-center bg-primary text-primary-foreground">
                        <CheckIcon className="size-3" />
                      </span>
                    ) : (
                      <span className="flex size-[18px] items-center justify-center text-muted-foreground">
                        <Spinner />
                      </span>
                    )}
                    <span className={cn(!done && "text-muted-foreground")}>{label}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  )
}
