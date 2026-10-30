import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "agendi"
import {
  CalendarClockIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  GraduationCapIcon,
  LogOutIcon,
  PencilIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react"

export const ActionsMenu = () => (
  <div className="flex justify-center pt-4">
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Ações do agendamento" />}>
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem>
          <PencilIcon />
          Editar
        </DropdownMenuItem>
        <DropdownMenuItem>
          <CalendarClockIcon />
          Reagendar
        </DropdownMenuItem>
        <DropdownMenuItem>
          <CopyIcon />
          Duplicar
          <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Trash2Icon />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
)

export const ExportMenu = () => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
      <DownloadIcon />
      Exportar
    </DropdownMenuTrigger>
    <DropdownMenuContent className="w-40">
      <DropdownMenuItem>
        <FileTextIcon />
        PDF
      </DropdownMenuItem>
      <DropdownMenuItem>
        <FileSpreadsheetIcon />
        Excel (XLSX)
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)

export const UserMenu = () => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger render={<Button variant="outline" />}>
      <UserIcon />
      Ana Ribeiro
    </DropdownMenuTrigger>
    <DropdownMenuContent className="w-56">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
        <DropdownMenuItem>
          <UserIcon />
          Perfil
        </DropdownMenuItem>
        <DropdownMenuItem>
          <SettingsIcon />
          Configurações
          <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuSub defaultOpen>
        <DropdownMenuSubTrigger>
          <GraduationCapIcon />
          Tutoriais
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem>Criar o primeiro agendamento</DropdownMenuItem>
          <DropdownMenuItem>Cadastrar serviços</DropdownMenuItem>
          <DropdownMenuItem>Fechar o caixa do dia</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuItem>
        <LogOutIcon />
        Sair
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)

export const CheckboxAndRadio = () => (
  <DropdownMenu defaultOpen>
    <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
      <SlidersHorizontalIcon />
      Exibição
    </DropdownMenuTrigger>
    <DropdownMenuContent className="w-56">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Colunas visíveis</DropdownMenuLabel>
        <DropdownMenuCheckboxItem defaultChecked>Cliente</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem defaultChecked>Profissional</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem>Sala</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem defaultChecked>Valor</DropdownMenuCheckboxItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
        <DropdownMenuRadioGroup defaultValue="time">
          <DropdownMenuRadioItem value="time">Horário</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="client">Nome do cliente</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="value">Valor</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
)
