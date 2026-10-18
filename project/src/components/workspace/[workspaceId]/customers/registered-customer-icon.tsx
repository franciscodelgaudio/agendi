import { ContactIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Marca discreta, ao lado do nome, de que o cliente do agendamento/atendimento é recorrente
// (cadastrado em Clientes). O ícone é o do menu Clientes.
export function RegisteredCustomerIcon() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span aria-label="Cliente cadastrado" className="inline-flex shrink-0 cursor-help text-muted-foreground" />}
      >
        <ContactIcon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>Cliente cadastrado</TooltipContent>
    </Tooltip>
  )
}
