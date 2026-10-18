import { ContactIcon } from "lucide-react"
import { CreateCustomerSheet } from "@/components/workspace/[workspaceId]/customers/create-customer-sheet"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

type Props = { workspaceId: string; canManage: boolean }

export function CustomersEmpty({ workspaceId, canManage }: Props) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ContactIcon />
        </EmptyMedia>
        <EmptyTitle>Nenhum cliente cadastrado</EmptyTitle>
        <EmptyDescription>
          {canManage
            ? "Cadastre os clientes que voltam sempre para encontrá-los pelo nome ou CPF."
            : "Os clientes cadastrados aparecem aqui."}
        </EmptyDescription>
      </EmptyHeader>
      {canManage && (
        <EmptyContent>
          <CreateCustomerSheet workspaceId={workspaceId} />
        </EmptyContent>
      )}
    </Empty>
  )
}
