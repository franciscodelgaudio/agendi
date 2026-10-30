import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "agendi"
import {
  ArchiveIcon,
  CalendarCheckIcon,
  CalendarIcon,
  ChevronsUpDownIcon,
  HomeIcon,
  LeafIcon,
  LifeBuoyIcon,
  MapPinIcon,
  MessagesSquareIcon,
  PlusIcon,
  TrendingUpIcon,
  UsersIcon,
  UsersRoundIcon,
  WalletIcon,
} from "lucide-react"

const NAV = [
  { items: [{ title: "Início", icon: HomeIcon, active: true }] },
  {
    label: "Geral",
    items: [
      { title: "Unidades", icon: MapPinIcon },
      { title: "Agenda", icon: CalendarIcon },
      { title: "Caixa", icon: WalletIcon },
      { title: "Equipe", icon: UsersRoundIcon },
      { title: "Estoque", icon: ArchiveIcon },
    ],
  },
  {
    label: "Atendimento",
    items: [
      { title: "Conversas", icon: MessagesSquareIcon },
    ],
  },
  {
    label: "Configurações",
    items: [
      { title: "Usuários", icon: UsersIcon },
      { title: "Tickets", icon: LifeBuoyIcon },
    ],
  },
]

const STATS = [
  { icon: TrendingUpIcon, label: "Faturamento do mês", value: "R$ 18.430,00", detail: "de R$ 24.000,00 previstos" },
  { icon: LeafIcon, label: "Serviços no mês", value: "142", detail: "+ 38 agendados até o fim do mês" },
  { icon: CalendarCheckIcon, label: "Agendamentos hoje", value: "9", detail: "Próximo às 14:00 · 4 atendidos" },
]

const TODAY = [
  { time: "09:00", client: "Mariana Souza", service: "Massagem relaxante · 60 min", status: "Atendido" },
  { time: "10:30", client: "Rafael Lima", service: "Drenagem linfática · 50 min", status: "Atendido" },
  { time: "14:00", client: "Juliana Alves", service: "Limpeza de pele · 45 min", status: "Confirmado" },
]

function AppSidebar() {
  return (
    <Sidebar collapsible="icon" className="h-full">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Spa Central">
              <Avatar className="size-8 rounded-lg after:rounded-lg">
                <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  S
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Spa Central</span>
                <span className="truncate text-xs text-muted-foreground">Workspace</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV.map((group, i) => (
          <SidebarGroup key={group.label ?? i}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton tooltip={item.title} isActive={item.active}>
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <Avatar className="size-8">
                <AvatarFallback className="bg-emerald-100 font-medium text-emerald-700">C</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Camila Rocha</span>
                <span className="truncate text-xs text-muted-foreground">camila@spacentral.com.br</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function HomePage() {
  return (
    <SidebarInset>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" style={{ alignSelf: "center" }} />
        <span className="text-sm font-medium">Início</span>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid gap-0.5">
            <h2 className="text-2xl font-semibold tracking-tight">Spa Central</h2>
            <span className="text-sm text-muted-foreground">Quinta-feira, 29 de outubro · 3 unidades</span>
          </div>
          <Button>
            <PlusIcon data-icon="inline-start" />
            Nova unidade
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {STATS.map((stat) => (
            <Card key={stat.label} size="sm">
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex size-7 items-center justify-center bg-muted text-foreground">
                    <stat.icon className="size-4" />
                  </span>
                  {stat.label}
                </div>
                <span className="text-2xl font-semibold tabular-nums">{stat.value}</span>
                <span className="truncate text-xs text-muted-foreground">{stat.detail}</span>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Agenda de hoje</CardTitle>
            <CardDescription>9 agendamentos, 4 atendidos</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {TODAY.map((b) => (
              <div key={b.time} className="flex items-center gap-3">
                <span className="w-12 font-mono text-xs text-muted-foreground tabular-nums">{b.time}</span>
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">{b.client}</span>
                  <span className="text-xs text-muted-foreground">{b.service}</span>
                </div>
                <Badge variant={b.status === "Atendido" ? "secondary" : "outline"}>{b.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </SidebarInset>
  )
}

export const AppShell = () => (
  <SidebarProvider className="min-h-0" style={{ height: "calc(100svh - 24px)" }}>
    <AppSidebar />
    <HomePage />
  </SidebarProvider>
)

export const Collapsed = () => (
  <SidebarProvider defaultOpen={false} className="min-h-0" style={{ height: "calc(100svh - 24px)" }}>
    <AppSidebar />
    <HomePage />
  </SidebarProvider>
)
