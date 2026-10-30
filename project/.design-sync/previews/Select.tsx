import {
  Field,
  FieldDescription,
  FieldLabel,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "agendi"

const services = [
  { value: "corte-feminino", label: "Corte feminino" },
  { value: "corte-masculino", label: "Corte masculino" },
  { value: "escova", label: "Escova modeladora" },
  { value: "coloracao", label: "Coloração" },
  { value: "manicure", label: "Manicure" },
  { value: "pedicure", label: "Pedicure" },
]

const statusItems = [
  { value: "all", label: "Todos os status" },
  { value: "pending", label: "Pendentes" },
  { value: "done", label: "Atendidos" },
]

export const Open = () => (
  <Field className="w-64">
    <FieldLabel>Serviço</FieldLabel>
    <Select items={services} defaultValue="escova" defaultOpen>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectLabel>Cabelo</SelectLabel>
          {services.slice(0, 4).map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Unhas</SelectLabel>
          {services.slice(4).map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
)

export const StatusFilter = () => (
  <Select items={statusItems} defaultValue="pending">
    <SelectTrigger className="w-44" aria-label="Filtrar por status">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {statusItems.map((item) => (
        <SelectItem key={item.value} value={item.value}>
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)

export const Sizes = () => (
  <div className="flex items-center gap-2">
    <Select items={statusItems} defaultValue="all">
      <SelectTrigger size="sm" className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statusItems.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <Select items={statusItems} defaultValue="all">
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statusItems.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)

export const WithPlaceholder = () => (
  <Field className="w-64">
    <FieldLabel>Profissional</FieldLabel>
    <Select>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Escolha um profissional" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="mariana">Mariana Souza</SelectItem>
        <SelectItem value="rafael">Rafael Lima</SelectItem>
      </SelectContent>
    </Select>
    <FieldDescription>Quem vai atender o cliente.</FieldDescription>
  </Field>
)

export const Disabled = () => (
  <Field className="w-64">
    <FieldLabel>Unidade</FieldLabel>
    <Select items={[{ value: "centro", label: "Unidade Centro" }]} defaultValue="centro" disabled>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="centro">Unidade Centro</SelectItem>
      </SelectContent>
    </Select>
  </Field>
)
