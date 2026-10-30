import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "agendi"
import { CopyIcon, PencilIcon, PrinterIcon, SendIcon, Trash2Icon } from "lucide-react"

export const IconButton = () => (
  <TooltipProvider>
    <div className="flex h-40 items-center justify-center">
      <Tooltip defaultOpen>
        <TooltipTrigger render={<Button variant="outline" size="icon" aria-label="Copiar código" />}>
          <CopyIcon />
        </TooltipTrigger>
        <TooltipContent>Copiar código #A3F9</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
)

export const OnText = () => (
  <TooltipProvider>
    <div className="flex h-40 items-center justify-center gap-6 text-sm">
      <Tooltip defaultOpen>
        <TooltipTrigger
          render={
            <span className="cursor-help font-medium underline decoration-muted-foreground/50 decoration-dotted underline-offset-4" />
          }
        >
          Mariana Souza
        </TooltipTrigger>
        <TooltipContent>(11) 98765-4321 · mariana@email.com</TooltipContent>
      </Tooltip>
      <span className="tabular-nums">R$ 350,00</span>
    </div>
  </TooltipProvider>
)

export const Sides = () => (
  <TooltipProvider>
    <div className="flex h-40 items-center justify-center gap-12">
      <Tooltip defaultOpen>
        <TooltipTrigger render={<Button variant="outline" size="icon-sm" aria-label="Enviar lembrete" />}>
          <SendIcon />
        </TooltipTrigger>
        <TooltipContent side="left">Lembrete</TooltipContent>
      </Tooltip>
      <Tooltip defaultOpen>
        <TooltipTrigger render={<Button variant="outline" size="icon-sm" aria-label="Editar" />}>
          <PencilIcon />
        </TooltipTrigger>
        <TooltipContent side="top">Editar</TooltipContent>
      </Tooltip>
      <Tooltip defaultOpen>
        <TooltipTrigger render={<Button variant="outline" size="icon-sm" aria-label="Imprimir" />}>
          <PrinterIcon />
        </TooltipTrigger>
        <TooltipContent side="bottom">Imprimir</TooltipContent>
      </Tooltip>
      <Tooltip defaultOpen>
        <TooltipTrigger render={<Button variant="outline" size="icon-sm" aria-label="Excluir" />}>
          <Trash2Icon />
        </TooltipTrigger>
        <TooltipContent side="right">Excluir</TooltipContent>
      </Tooltip>
    </div>
  </TooltipProvider>
)
