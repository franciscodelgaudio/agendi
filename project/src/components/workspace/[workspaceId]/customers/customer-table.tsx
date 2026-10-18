import { CalendarPlusIcon, IdCardIcon, MailIcon, PhoneIcon, SettingsIcon, UserIcon, type LucideIcon } from "lucide-react"
import type { ClienteDaLista } from "@/contextos/clientes/consultas"
import { CustomerActions } from "@/components/workspace/[workspaceId]/customers/customer-actions"
import { formatCpf, formatPhone } from "@/components/workspace/[workspaceId]/customers/customer-format"
import { CodeCell, CodeHead } from "@/components/shared/record-code"
import { Avatar } from "@/components/ui/avatar"
import { InitialFallback } from "@/components/shared/initial-fallback"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn, dateTimeFormat } from "@/service/_shared/utils"

type Props = {
  customers: ClienteDaLista[]
  workspaceId: string
  // Sem permissão, a coluna de ações (editar) não aparece.
  canManage: boolean
}

// Colunas escondidas pelo container, das menos para as mais importantes. Pior caso de cada
// uma (com o px-4): Nome ≥ 160px, Ações 90px, Telefone "+55 (11) 98765-4321" com "+4" 210px,
// CPF 140px, E-mail ~280px (35 caracteres; o Nome encolhe se passar), Criado em 160px e
// Código 100px. Somas: 460 (@lg), 600 (@2xl), 880 (@4xl) e 1140 (@6xl).
const HIDE = {
  phone: "@max-lg:hidden",
  cpf: "@max-2xl:hidden",
  email: "@max-4xl:hidden",
  createdAt: "@max-6xl:hidden",
  code: "@max-6xl:hidden",
}

export function CustomerTable({ customers, workspaceId, canManage }: Props) {
  return (
    <div className="border">
      <Table>
        <TableHeader>
          <TableRow>
            <CodeHead className={HIDE.code} />
            <HeadWithIcon icon={UserIcon} label="Nome" className="w-full" />
            <HeadWithIcon icon={IdCardIcon} label="CPF" className={HIDE.cpf} />
            <HeadWithIcon icon={PhoneIcon} label="Telefone" className={HIDE.phone} />
            <HeadWithIcon icon={MailIcon} label="E-mail" className={HIDE.email} />
            <HeadWithIcon icon={CalendarPlusIcon} label="Criado em" className={HIDE.createdAt} />
            {canManage && <HeadWithIcon icon={SettingsIcon} label="Ações" className="w-0 text-right" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canManage ? 7 : 6} className="h-24 px-4 text-center text-muted-foreground">
                Nenhum cliente encontrado.
              </TableCell>
            </TableRow>
          ) : (
            customers.map((customer) => (
              <TableRow key={customer.id}>
                <CodeCell id={customer.id} className={HIDE.code} />
                <TableCell className="max-w-0 px-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <InitialFallback name={customer.nome} />
                    </Avatar>
                    <span className="truncate font-medium">{customer.nome}</span>
                  </div>
                </TableCell>
                <TableCell className={cn("px-4 tabular-nums", HIDE.cpf)}>{formatCpf(customer.cpf)}</TableCell>
                <TableCell className={cn("px-4 tabular-nums", HIDE.phone)}>
                  <Phones phones={customer.telefones} />
                </TableCell>
                <TableCell className={cn("px-4 text-muted-foreground", HIDE.email)}>{customer.email ?? "—"}</TableCell>
                <TableCell className={cn("px-4 text-muted-foreground", HIDE.createdAt)}>
                  {dateTimeFormat.format(customer.criadoEm)}
                </TableCell>
                {canManage && (
                  <TableCell className="px-4 text-right">
                    <CustomerActions workspaceId={workspaceId} customer={customer} />
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

function HeadWithIcon({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <TableHead className={cn("px-4", className)}>
      <span className="inline-flex items-center gap-1">
        <Icon className="size-4 text-muted-foreground" />
        {label}
      </span>
    </TableHead>
  )
}

// O primeiro telefone e, se houver mais, "+N" com os outros no tooltip.
function Phones({ phones }: { phones: string[] }) {
  const [first, ...rest] = phones
  if (!first) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex items-center gap-1.5">
      <span>{formatPhone(first)}</span>
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="shrink-0 cursor-help rounded-sm bg-muted px-1.5 text-xs font-medium text-muted-foreground" />
            }
          >
            +{rest.length}
          </TooltipTrigger>
          <TooltipContent className="max-w-none">
            <ul className="grid gap-1 tabular-nums">
              {rest.map((phone) => (
                <li key={phone}>{formatPhone(phone)}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  )
}
