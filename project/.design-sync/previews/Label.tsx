import { Checkbox, Input, Label, Textarea } from "agendi"

export const WithInput = () => (
  <div className="flex w-72 flex-col gap-2">
    <Label htmlFor="lb-unit">Nome da unidade</Label>
    <Input id="lb-unit" placeholder="Ex.: Unidade Pinheiros" />
  </div>
)

export const Required = () => (
  <div className="flex w-72 flex-col gap-2">
    <Label htmlFor="lb-pro">
      Profissional responsável
      <span className="text-destructive">*</span>
    </Label>
    <Input id="lb-pro" defaultValue="Carla Mendes" />
  </div>
)

export const WithCheckbox = () => (
  <div className="flex flex-col gap-3">
    <Label>
      <Checkbox defaultChecked />
      Enviar lembrete por WhatsApp
    </Label>
    <Label>
      <Checkbox />
      Cobrar taxa de não comparecimento
    </Label>
  </div>
)

export const Disabled = () => (
  <div className="group flex w-72 flex-col gap-2" data-disabled="true">
    <Label htmlFor="lb-dis">Observações internas</Label>
    <Textarea id="lb-dis" defaultValue="Somente gerentes podem editar." disabled />
  </div>
)
