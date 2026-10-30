import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  Field,
  FieldDescription,
  FieldLabel,
} from "agendi"

type Client = { id: string; name: string; phone: string }

const clients: Client[] = [
  { id: "1", name: "Mariana Souza", phone: "(11) 98765-4321" },
  { id: "2", name: "Rafael Lima", phone: "(11) 99812-3344" },
  { id: "3", name: "Juliana Alves", phone: "(21) 97654-1200" },
  { id: "4", name: "Carlos Menezes", phone: "(11) 96543-8790" },
  { id: "5", name: "Larissa Prado", phone: "(31) 99123-4567" },
]

type Member = { id: string; name: string; role: string }

const team: Member[] = [
  { id: "a", name: "Ana Paula Ribeiro", role: "Cabeleireira" },
  { id: "b", name: "Bruno Carvalho", role: "Barbeiro" },
  { id: "c", name: "Camila Duarte", role: "Manicure" },
  { id: "d", name: "Diego Fernandes", role: "Massoterapeuta" },
]

const clientLabel = (c: Client) => c.name
const memberLabel = (m: Member) => m.name
const sameId = (a: { id: string }, b: { id: string }) => a.id === b.id

export const Open = () => (
  <Field className="w-72">
    <FieldLabel>Cliente</FieldLabel>
    <Combobox items={clients} itemToStringLabel={clientLabel} isItemEqualToValue={sameId} defaultOpen>
      <ComboboxInput placeholder="Buscar cliente..." />
      <ComboboxContent>
        <ComboboxEmpty>Nenhum cliente encontrado.</ComboboxEmpty>
        <ComboboxList>
          {(client: Client) => (
            <ComboboxItem key={client.id} value={client}>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate">{client.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{client.phone}</span>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </Field>
)

export const Selected = () => (
  <Field className="w-72">
    <FieldLabel>Cliente</FieldLabel>
    <Combobox
      items={clients}
      itemToStringLabel={clientLabel}
      isItemEqualToValue={sameId}
      defaultValue={clients[2]}
    >
      <ComboboxInput placeholder="Buscar cliente..." showClear />
      <ComboboxContent>
        <ComboboxEmpty>Nenhum cliente encontrado.</ComboboxEmpty>
        <ComboboxList>
          {(client: Client) => (
            <ComboboxItem key={client.id} value={client}>
              {client.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
    <FieldDescription>Digite o nome ou o telefone.</FieldDescription>
  </Field>
)

export const MultipleChips = () => (
  <Field className="w-96">
    <FieldLabel>Equipe</FieldLabel>
    <Combobox
      multiple
      items={team}
      itemToStringLabel={memberLabel}
      isItemEqualToValue={sameId}
      defaultValue={[team[0], team[2]]}
    >
      <ComboboxChips className="w-full">
        <ComboboxValue>
          {(members: Member[]) => members.map((m) => <ComboboxChip key={m.id}>{m.name}</ComboboxChip>)}
        </ComboboxValue>
        <ComboboxChipsInput placeholder="" />
      </ComboboxChips>
      <ComboboxContent>
        <ComboboxEmpty>Ninguém encontrado.</ComboboxEmpty>
        <ComboboxList>
          {(m: Member) => (
            <ComboboxItem key={m.id} value={m}>
              {m.name}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </Field>
)

const products = ["Shampoo hidratante 300 ml", "Condicionador reparador", "Máscara capilar 500 g", "Esmalte vermelho"]

export const NoResults = () => (
  <Field className="w-72">
    <FieldLabel>Produto</FieldLabel>
    <Combobox items={products} defaultInputValue="Óleo de argan" defaultOpen>
      <ComboboxInput placeholder="Buscar produto no estoque..." />
      <ComboboxContent>
        <ComboboxEmpty>Nenhum produto encontrado.</ComboboxEmpty>
        <ComboboxList>
          {(p: string) => (
            <ComboboxItem key={p} value={p}>
              {p}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </Field>
)
