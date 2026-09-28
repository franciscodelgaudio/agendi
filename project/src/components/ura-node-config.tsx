"use client"

import { useRef, useState } from "react"
import { BracesIcon, ImagePlusIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { UraNode } from "@/lib/ura-graph"
import {
  ANSWER_VALIDATIONS,
  CONDITION_OPERATORS,
  MAX_DAYS_AHEAD,
  MAX_MENU_OPTIONS,
  MAX_OPTION_LABEL,
  MAX_RETRIES,
  MAX_TIMEOUT_MINUTES,
  MEDIA_TYPES,
  URA_TRIGGERS,
  type AnswerValidation,
  type UraNodeData,
  type UraNodeType,
  type WaitSettings,
} from "@/lib/ura-nodes"
import { nodeMeta, nodeSummary, operatorLabels } from "@/components/ura-node-meta"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export type ConfigContext = {
  workspaceId: string
  channels: { id: string; name: string }[]
  units: { id: string; name: string }[]
  users: { id: string; name: string }[]
  nodes: UraNode[]
  variables: string[]
}

type Props<T extends UraNodeType> = {
  node: UraNode<T>
  onChange: (data: UraNodeData[T]) => void
  ctx: ConfigContext
}

const triggerLabels = { new_conversation: "Conversa nova", keyword: "Palavra-chave", any_message: "Qualquer mensagem" }
const validationLabels: Record<AnswerValidation, string> = {
  none: "Qualquer resposta",
  number: "Número",
  email: "E-mail",
  phone: "Telefone",
  date: "Data (dd/mm)",
}
const mediaLabels = { image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento" }
const NONE = "__none"

// Nome de variável: minúsculas, sem acento, só letras, números e _.
const toVariableName = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 40)

export function UraNodeConfig({ node, onChange, ctx }: Props<UraNodeType>) {
  const id = `ura-${node.id}`
  // Cada formulário recebe o nó já com o tipo certo.
  const props = <T extends UraNodeType>() => ({ node, onChange, ctx, id }) as unknown as FormProps<T>
  switch (node.type) {
    case "start":
      return <StartConfig {...props<"start">()} />
    case "sendMessage":
      return <SendMessageConfig {...props<"sendMessage">()} />
    case "sendMedia":
      return <SendMediaConfig {...props<"sendMedia">()} />
    case "waitForReply":
      return <WaitForReplyConfig {...props<"waitForReply">()} />
    case "menu":
      return <MenuConfig {...props<"menu">()} />
    case "condition":
      return <ConditionConfig {...props<"condition">()} />
    case "setVariable":
      return <SetVariableConfig {...props<"setVariable">()} />
    case "goTo":
      return <GoToConfig {...props<"goTo">()} />
    case "delay":
      return <DelayConfig {...props<"delay">()} />
    case "closeConversation":
    case "handoff":
      return <EndConfig {...props<"handoff" | "closeConversation">()} />
    case "chooseService":
      return <ChooseServiceConfig {...props<"chooseService">()} />
    case "chooseSlot":
      return <ChooseSlotConfig {...props<"chooseSlot">()} />
    case "createBooking":
      return <CreateBookingConfig {...props<"createBooking">()} />
  }
}

type FormProps<T extends UraNodeType> = Props<T> & { id: string }

function useSet<T extends UraNodeType>({ node, onChange }: Props<T>) {
  return <K extends keyof UraNodeData[T]>(key: K, value: UraNodeData[T][K]) => onChange({ ...node.data, [key]: value })
}

function StartConfig(props: FormProps<"start">) {
  const { node, ctx, id } = props
  const set = useSet(props)
  const { trigger, keywords, channelIds } = node.data
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${id}-trigger`}>Quando iniciar</FieldLabel>
        <SimpleSelect
          id={`${id}-trigger`}
          value={trigger}
          items={URA_TRIGGERS.map((value) => ({ value, label: triggerLabels[value] }))}
          onChange={(value) => set("trigger", value)}
        />
      </Field>
      {trigger === "keyword" && (
        <Field>
          <FieldLabel htmlFor={`${id}-keywords`}>Palavras-chave (separadas por vírgula)</FieldLabel>
          <Input
            id={`${id}-keywords`}
            value={keywords.join(",")}
            placeholder="agendar, horário, promoção"
            onChange={(event) => set("keywords", event.target.value.split(","))}
          />
        </Field>
      )}
      {ctx.channels.length > 1 && (
        <Field>
          <FieldLabel>Canais (nenhum marcado = todos)</FieldLabel>
          <div className="grid gap-2">
            {ctx.channels.map((channel) => (
              <label key={channel.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={channelIds.includes(channel.id)}
                  onCheckedChange={(checked) =>
                    set("channelIds", checked ? [...channelIds, channel.id] : channelIds.filter((c) => c !== channel.id))
                  }
                />
                {channel.name}
              </label>
            ))}
          </div>
        </Field>
      )}
    </FieldGroup>
  )
}

function SendMessageConfig(props: FormProps<"sendMessage">) {
  const set = useSet(props)
  return (
    <FieldGroup>
      <TemplateField
        id={`${props.id}-text`}
        label="Mensagem"
        value={props.node.data.text}
        onChange={(value) => set("text", value)}
        variables={props.ctx.variables}
        multiline
      />
    </FieldGroup>
  )
}

function SendMediaConfig(props: FormProps<"sendMedia">) {
  const { node, ctx, id } = props
  const set = useSet(props)
  const { mediaType, url, caption } = node.data
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${id}-type`}>Tipo</FieldLabel>
        <SimpleSelect
          id={`${id}-type`}
          value={mediaType}
          items={MEDIA_TYPES.map((value) => ({ value, label: mediaLabels[value] }))}
          onChange={(value) => set("mediaType", value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-url`}>Link do arquivo</FieldLabel>
        <Input id={`${id}-url`} value={url} placeholder="https://" onChange={(event) => set("url", event.target.value)} />
        {mediaType === "image" && (
          <ImageUploadButton workspaceId={ctx.workspaceId} onUploaded={(value) => set("url", value)} />
        )}
      </Field>
      {mediaType !== "audio" && (
        <TemplateField
          id={`${id}-caption`}
          label="Legenda"
          value={caption}
          onChange={(value) => set("caption", value)}
          variables={ctx.variables}
          multiline
        />
      )}
    </FieldGroup>
  )
}

function WaitForReplyConfig(props: FormProps<"waitForReply">) {
  const { node, ctx, id } = props
  const set = useSet(props)
  const { message, variable, validation, errorMessage, maxRetries, timeoutMinutes } = node.data
  return (
    <FieldGroup>
      <TemplateField id={`${id}-message`} label="Pergunta" value={message} onChange={(v) => set("message", v)} variables={ctx.variables} multiline />
      <VariableField id={`${id}-variable`} value={variable} onChange={(v) => set("variable", v)} />
      <Field>
        <FieldLabel htmlFor={`${id}-validation`}>Aceitar</FieldLabel>
        <SimpleSelect
          id={`${id}-validation`}
          value={validation}
          items={ANSWER_VALIDATIONS.map((value) => ({ value, label: validationLabels[value] }))}
          onChange={(value) => set("validation", value)}
        />
      </Field>
      {validation !== "none" && (
        <>
          <TemplateField
            id={`${id}-error`}
            label="Aviso de resposta inválida"
            value={errorMessage}
            onChange={(v) => set("errorMessage", v)}
            variables={ctx.variables}
          />
          <NumberField id={`${id}-retries`} label="Tentativas extras" value={maxRetries} min={0} max={MAX_RETRIES} onChange={(v) => set("maxRetries", v)} />
        </>
      )}
      <TimeoutField id={`${id}-timeout`} value={timeoutMinutes} onChange={(v) => set("timeoutMinutes", v)} />
    </FieldGroup>
  )
}

function MenuConfig(props: FormProps<"menu">) {
  const { node, ctx, id } = props
  const set = useSet(props)
  const { message, buttonLabel, options, variable } = node.data
  return (
    <FieldGroup>
      <TemplateField id={`${id}-message`} label="Pergunta" value={message} onChange={(v) => set("message", v)} variables={ctx.variables} multiline />
      <Field>
        <FieldLabel>Opções</FieldLabel>
        <div className="grid gap-2">
          {options.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <Input
                aria-label={`Opção ${i + 1}`}
                value={option.label}
                maxLength={MAX_OPTION_LABEL}
                onChange={(event) => set("options", options.map((o, j) => (j === i ? { label: event.target.value } : o)))}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover opção ${i + 1}`}
                onClick={() => set("options", options.filter((_, j) => j !== i))}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          {options.length < MAX_MENU_OPTIONS && (
            <Button variant="outline" size="sm" onClick={() => set("options", [...options, { label: "" }])}>
              <PlusIcon />
              Adicionar opção
            </Button>
          )}
        </div>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-button`}>Botão da lista</FieldLabel>
        <Input id={`${id}-button`} value={buttonLabel} maxLength={20} onChange={(event) => set("buttonLabel", event.target.value)} />
      </Field>
      <VariableField id={`${id}-variable`} value={variable} onChange={(v) => set("variable", v)} />
      <WaitSettingsFields {...props} />
    </FieldGroup>
  )
}

function ConditionConfig(props: FormProps<"condition">) {
  const { node, ctx, id } = props
  const set = useSet(props)
  const { variable, operator, value } = node.data
  const noValue = operator === "exists" || operator === "not_exists"
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${id}-variable`}>Variável</FieldLabel>
        <SimpleSelect
          id={`${id}-variable`}
          value={variable || NONE}
          items={[{ value: NONE, label: "Escolha" }, ...ctx.variables.map((name) => ({ value: name, label: name }))]}
          onChange={(v) => set("variable", v === NONE ? "" : v)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${id}-operator`}>Regra</FieldLabel>
        <SimpleSelect
          id={`${id}-operator`}
          value={operator}
          items={CONDITION_OPERATORS.map((op) => ({ value: op, label: operatorLabels[op] }))}
          onChange={(v) => set("operator", v)}
        />
      </Field>
      {!noValue && (
        <TemplateField id={`${id}-value`} label="Valor" value={value} onChange={(v) => set("value", v)} variables={ctx.variables} />
      )}
    </FieldGroup>
  )
}

function SetVariableConfig(props: FormProps<"setVariable">) {
  const set = useSet(props)
  return (
    <FieldGroup>
      <VariableField id={`${props.id}-variable`} value={props.node.data.variable} onChange={(v) => set("variable", v)} />
      <TemplateField
        id={`${props.id}-value`}
        label="Valor"
        value={props.node.data.value}
        onChange={(v) => set("value", v)}
        variables={props.ctx.variables}
      />
    </FieldGroup>
  )
}

function GoToConfig(props: FormProps<"goTo">) {
  const { node, ctx, id } = props
  const set = useSet(props)
  const title = (nodeId: string) => {
    const target = ctx.nodes.find((n) => n.id === nodeId)
    return target ? nodeMeta[target.type].label : null
  }
  const targets = ctx.nodes
    .filter((n) => n.type !== "start" && n.id !== node.id)
    .map((n) => {
      const summary = nodeSummary(n, title)
      return { value: n.id, label: summary ? `${nodeMeta[n.type].label} · ${summary}` : nodeMeta[n.type].label }
    })
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${id}-target`}>Destino</FieldLabel>
        <SimpleSelect
          id={`${id}-target`}
          value={node.data.targetNodeId || NONE}
          items={[{ value: NONE, label: "Escolha" }, ...targets]}
          onChange={(v) => set("targetNodeId", v === NONE ? "" : v)}
        />
      </Field>
    </FieldGroup>
  )
}

const DELAY_UNITS = [
  { value: "1", label: "segundos" },
  { value: "60", label: "minutos" },
  { value: "3600", label: "horas" },
]

function DelayConfig(props: FormProps<"delay">) {
  const set = useSet(props)
  const { seconds } = props.node.data
  const [unit, setUnit] = useState(seconds % 3600 === 0 ? 3600 : seconds % 60 === 0 ? 60 : 1)
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${props.id}-amount`}>Esperar</FieldLabel>
        <div className="flex gap-2">
          <Input
            id={`${props.id}-amount`}
            type="number"
            min={1}
            value={Math.round(seconds / unit)}
            onChange={(event) => set("seconds", Math.max(1, Number(event.target.value) || 1) * unit)}
          />
          <SimpleSelect
            id={`${props.id}-unit`}
            value={String(unit)}
            items={DELAY_UNITS}
            onChange={(v) => {
              setUnit(Number(v))
              set("seconds", Math.max(1, Math.round(seconds / unit)) * Number(v))
            }}
          />
        </div>
      </Field>
    </FieldGroup>
  )
}

function EndConfig(props: FormProps<"handoff" | "closeConversation">) {
  const { node, ctx, id, onChange } = props
  return (
    <FieldGroup>
      {node.type === "handoff" && (
        <Field>
          <FieldLabel htmlFor={`${id}-user`}>Atendente</FieldLabel>
          <SimpleSelect
            id={`${id}-user`}
            value={node.data.userId ?? NONE}
            items={[{ value: NONE, label: "Fila da equipe" }, ...ctx.users.map((u) => ({ value: u.id, label: u.name }))]}
            onChange={(v) => onChange({ ...node.data, userId: v === NONE ? null : v })}
          />
        </Field>
      )}
      <TemplateField
        id={`${id}-message`}
        label="Mensagem"
        value={node.data.message}
        onChange={(message) => onChange({ ...node.data, message } as never)}
        variables={ctx.variables}
        multiline
      />
    </FieldGroup>
  )
}

function ChooseServiceConfig(props: FormProps<"chooseService">) {
  const { node, ctx, id } = props
  const set = useSet(props)
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${id}-unit`}>Unidade</FieldLabel>
        <SimpleSelect
          id={`${id}-unit`}
          value={node.data.unitId ?? NONE}
          items={[{ value: NONE, label: "Escolha" }, ...ctx.units.map((u) => ({ value: u.id, label: u.name }))]}
          onChange={(v) => set("unitId", v === NONE ? null : v)}
        />
      </Field>
      <TemplateField id={`${id}-message`} label="Pergunta" value={node.data.message} onChange={(v) => set("message", v)} variables={ctx.variables} multiline />
      <Field>
        <FieldLabel htmlFor={`${id}-button`}>Botão da lista</FieldLabel>
        <Input id={`${id}-button`} value={node.data.buttonLabel} maxLength={20} onChange={(event) => set("buttonLabel", event.target.value)} />
      </Field>
      <WaitSettingsFields {...props} />
    </FieldGroup>
  )
}

function ChooseSlotConfig(props: FormProps<"chooseSlot">) {
  const { node, ctx, id } = props
  const set = useSet(props)
  return (
    <FieldGroup>
      <TemplateField id={`${id}-message`} label="Pergunta" value={node.data.message} onChange={(v) => set("message", v)} variables={ctx.variables} multiline />
      <NumberField
        id={`${id}-days`}
        label="Dias à frente"
        value={node.data.daysAhead}
        min={1}
        max={MAX_DAYS_AHEAD}
        onChange={(v) => set("daysAhead", v)}
      />
      <Field>
        <FieldLabel htmlFor={`${id}-button`}>Botão da lista</FieldLabel>
        <Input id={`${id}-button`} value={node.data.buttonLabel} maxLength={20} onChange={(event) => set("buttonLabel", event.target.value)} />
      </Field>
      <WaitSettingsFields {...props} />
    </FieldGroup>
  )
}

function CreateBookingConfig(props: FormProps<"createBooking">) {
  const set = useSet(props)
  return (
    <FieldGroup>
      <TemplateField
        id={`${props.id}-guest`}
        label="Nome do cliente"
        value={props.node.data.guestName}
        onChange={(v) => set("guestName", v)}
        variables={props.ctx.variables}
      />
      <TemplateField
        id={`${props.id}-room`}
        label="Quarto"
        value={props.node.data.guestRoom}
        onChange={(v) => set("guestRoom", v)}
        variables={props.ctx.variables}
      />
    </FieldGroup>
  )
}

function WaitSettingsFields<T extends "menu" | "chooseService" | "chooseSlot">(props: FormProps<T>) {
  const { node, ctx, id, onChange } = props
  const data = node.data as UraNodeData[T] & WaitSettings
  const set = (patch: Partial<WaitSettings>) => onChange({ ...data, ...patch })
  return (
    <>
      <TemplateField
        id={`${id}-retry`}
        label="Aviso quando não entende"
        value={data.retryMessage}
        onChange={(retryMessage) => set({ retryMessage })}
        variables={ctx.variables}
      />
      <NumberField
        id={`${id}-retries`}
        label="Tentativas extras"
        value={data.maxRetries}
        min={0}
        max={MAX_RETRIES}
        onChange={(maxRetries) => set({ maxRetries })}
      />
      <TimeoutField id={`${id}-timeout`} value={data.timeoutMinutes} onChange={(timeoutMinutes) => set({ timeoutMinutes })} />
    </>
  )
}

function TimeoutField({ id, value, onChange }: { id: string; value: number; onChange: (value: number) => void }) {
  return (
    <NumberField
      id={id}
      label="Sem resposta após (min, 0 = esperar sempre)"
      value={value}
      min={0}
      max={MAX_TIMEOUT_MINUTES}
      onChange={onChange}
    />
  )
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Math.min(max, Math.max(min, Math.round(Number(event.target.value) || 0))))}
      />
    </Field>
  )
}

function VariableField({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Guardar em variável</FieldLabel>
      <Input id={id} value={value} placeholder="ex.: nome" className="font-mono" onChange={(event) => onChange(toVariableName(event.target.value))} />
    </Field>
  )
}

function SimpleSelect<T extends string>({
  id,
  value,
  items,
  onChange,
}: {
  id: string
  value: T
  items: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <Select items={items} value={value} onValueChange={(next) => next != null && onChange(next as T)}>
      <SelectTrigger id={id} className="w-full min-w-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Texto com {{variáveis}}: o menu insere a variável onde está o cursor.
function TemplateField({
  id,
  label,
  value,
  onChange,
  variables,
  multiline = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  variables: string[]
  multiline?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)

  function insert(name: string) {
    const element = ref.current
    const token = `{{${name}}}`
    const start = element?.selectionStart ?? value.length
    const end = element?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + token + value.slice(end))
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + token.length, start + token.length)
    })
  }

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label="Inserir variável" />}>
            <BracesIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-72 w-56 overflow-y-auto">
            {variables.map((name) => (
              <DropdownMenuItem key={name} className="font-mono text-xs" onClick={() => insert(name)}>
                {name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {multiline ? (
        <Textarea id={id} ref={ref} value={value} rows={4} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input id={id} ref={ref} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  )
}

const ACCEPTED_IMAGES = ["image/jpeg", "image/png", "image/webp"]

// Envia a imagem para o R2 e preenche o link do nó.
function ImageUploadButton({ workspaceId, onUploaded }: { workspaceId: string; onUploaded: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    if (!ACCEPTED_IMAGES.includes(file.type)) return setError("Envie uma imagem JPG, PNG ou WebP.")
    setUploading(true)
    setError(null)
    const body = new FormData()
    body.set("file", file)
    body.set("target", "ura")
    try {
      const response = await fetch(`/api/workspace/${workspaceId}/uploads`, { method: "POST", body })
      const result = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (result.url) onUploaded(result.url)
      else setError(result.error ?? "Não foi possível enviar a imagem. Tente novamente.")
    } catch {
      setError("Não foi possível enviar a imagem. Tente novamente.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_IMAGES.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) void upload(file)
        }}
      />
      <Button variant="outline" size="sm" loading={uploading} onClick={() => input.current?.click()}>
        <ImagePlusIcon />
        Enviar imagem
      </Button>
      {error && <FieldError>{error}</FieldError>}
    </>
  )
}
