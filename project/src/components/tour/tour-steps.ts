import type { UnitPage, WorkspacePage } from "@/lib/page-access"

// O que a função do usuário enxerga; passos de páginas que ele não vê ficam de fora.
export type TourAccess = {
  canManage: boolean
  inbox: boolean
  pages: { workspace: WorkspacePage[]; unit: UnitPage[] }
}

export type TourStep = {
  id: string
  title: string
  body: string
  // Índice da missão do tutorial a que o passo pertence (só no tutorial inicial).
  mission?: number
  // Valor do data-tour do elemento destacado; sem ele, a caixa fica no centro da tela.
  target?: string
  // click: avança quando o usuário clica no destaque. reveal: avança quando `expect` aparece
  // (ex.: selecionar um horário abre o formulário). form: o destaque é um formulário; avança
  // quando ele fecha e `expect` aparece (salvou), ou volta um passo (cancelou).
  action?: "click" | "reveal" | "form"
  expect?: string
  // Pula para `to` se `target` já estiver na tela (ex.: a unidade já existe).
  skipIf?: { target: string; to: string }
  // Para onde o "Próximo" leva quando o destaque de um clique não aparece (relativo ao workspace).
  href?: string
  // Lado preferido da caixa em relação ao destaque.
  side?: "top" | "bottom" | "left" | "right"
  // O destaque fica na sidebar, que no celular precisa ser aberta.
  sidebar?: boolean
  show?: (access: TourAccess) => boolean
}

export type TourId = "start" | "general" | "service" | "agenia" | "settings"

export type Tour = {
  id: TourId
  title: string
  missions?: string[]
  steps: TourStep[]
  show?: (access: TourAccess) => boolean
}

const workspacePage = (page: WorkspacePage) => (access: TourAccess) => access.pages.workspace.includes(page)
const unitPage = (page: UnitPage) => (access: TourAccess) => access.pages.unit.includes(page)
const manages = (access: TourAccess) => access.canManage
const managesUnits = (access: TourAccess) => access.canManage && access.pages.workspace.includes("units")
const managesUnitPage = (page: UnitPage) => (access: TourAccess) => access.canManage && access.pages.unit.includes(page)

// Passos que levam até uma unidade, repetidos nos tutoriais que mostram as abas dela.
const openUnit: TourStep[] = [
  {
    id: "nav-units",
    target: "nav-units",
    action: "click",
    href: "/unit",
    sidebar: true,
    side: "right",
    title: "Unidades",
    body: "Clique em Unidades.",
    show: workspacePage("units"),
  },
  {
    id: "unit-row",
    target: "unit-row",
    action: "click",
    title: "Abra a unidade",
    body: "Clique numa unidade.",
    show: workspacePage("units"),
  },
]

// Primeiro acesso: três missões curtas que deixam uma unidade pronta para agendar.
const start: Tour = {
  id: "start",
  title: "Primeiros passos",
  missions: ["Crie sua unidade", "Cadastre um serviço", "Faça um agendamento"],
  steps: [
    {
      id: "welcome",
      title: "Boas-vindas ao agendi",
      body: "Em três missões rápidas você cria uma unidade, cadastra um serviço e faz o primeiro agendamento.",
    },
    {
      ...openUnit[0],
      mission: 0,
      body: "Cada unidade é um espaço de atendimento, próprio ou dentro de um estabelecimento parceiro. Clique em Unidades.",
    },
    {
      id: "create-unit",
      mission: 0,
      target: "create-unit",
      action: "click",
      skipIf: { target: "unit-row", to: "unit-row" },
      title: "Cadastre uma unidade",
      body: "Clique em Cadastrar unidade.",
      show: managesUnits,
    },
    {
      id: "create-unit-form",
      mission: 0,
      target: "create-unit-form",
      action: "form",
      expect: "unit-row",
      side: "left",
      title: "Dados da unidade",
      body: "Dê um nome, confira os horários e as salas e diga onde a unidade funciona. Depois clique em Cadastrar.",
      show: managesUnits,
    },
    { ...openUnit[1], mission: 0, body: "Clique na unidade para abrir o painel dela." },
    {
      id: "unit-tabs",
      mission: 1,
      target: "unit-tabs",
      title: "O painel da unidade",
      body: "Pelas abas você chega aos serviços, ao calendário, aos atendimentos, ao estoque, à equipe e ao caixa desta unidade.",
    },
    {
      id: "unit-tab-services",
      mission: 1,
      target: "unit-tab-services",
      action: "click",
      title: "Serviços",
      body: "Sem serviços a unidade não agenda nem registra atendimentos. Clique em Serviços.",
      show: unitPage("services"),
    },
    {
      id: "create-service",
      mission: 1,
      target: "create-service",
      action: "click",
      skipIf: { target: "service-row", to: "unit-tab-calendar" },
      title: "Cadastre um serviço",
      body: "Clique em Cadastrar serviço.",
      show: managesUnitPage("services"),
    },
    {
      id: "create-service-form",
      mission: 1,
      target: "create-service-form",
      action: "form",
      expect: "service-row",
      side: "left",
      title: "Dados do serviço",
      body: "Informe o nome, o valor e a duração média. Depois clique em Cadastrar.",
      show: managesUnitPage("services"),
    },
    {
      id: "unit-tab-calendar",
      mission: 2,
      target: "unit-tab-calendar",
      action: "click",
      title: "Calendário",
      body: "Os agendamentos da unidade ficam aqui. Clique em Calendário.",
      show: unitPage("calendar"),
    },
    {
      id: "unit-calendar",
      mission: 2,
      target: "unit-calendar",
      action: "reveal",
      expect: "booking-form",
      side: "top",
      title: "Escolha um horário",
      body: "Clique num horário livre do calendário (ou arraste para escolher a duração).",
      show: managesUnitPage("calendar"),
    },
    {
      id: "booking-form",
      mission: 2,
      target: "booking-form",
      action: "form",
      expect: "booking-event",
      title: "Dados do agendamento",
      body: "Escolha a massagista, a sala e o serviço e informe o hóspede. Depois clique em Agendar.",
      show: managesUnitPage("calendar"),
    },
    {
      id: "done",
      title: "Missões concluídas",
      body: "Sua unidade já recebe agendamentos. Quando quiser, conheça as outras áreas do agendi:",
    },
  ],
}

// Os tutoriais das áreas seguem os grupos da sidebar.
const general: Tour = {
  id: "general",
  title: "Geral",
  show: (access) =>
    (["calendar", "cash_flow", "team"] as const).some((page) => access.pages.workspace.includes(page)) ||
    access.pages.unit.includes("stock"),
  steps: [
    {
      id: "nav-calendar",
      target: "nav-calendar",
      sidebar: true,
      side: "right",
      title: "Calendário",
      body: "Os agendamentos de todas as unidades num calendário só.",
      show: workspacePage("calendar"),
    },
    {
      id: "nav-cash_flow",
      target: "nav-cash_flow",
      action: "click",
      href: "/cash-flow",
      sidebar: true,
      side: "right",
      title: "Caixa geral",
      body: "O caixa de todas as unidades somado. Clique em Caixa.",
      show: workspacePage("cash_flow"),
    },
    {
      id: "cash-flow-nav",
      target: "cash-flow-nav",
      title: "Períodos",
      body: "Veja a semana, o mês ou o ano e navegue entre os períodos. O previsto vem dos agendamentos; o realizado, dos atendimentos.",
      show: workspacePage("cash_flow"),
    },
    {
      id: "nav-team",
      target: "nav-team",
      action: "click",
      href: "/team",
      sidebar: true,
      side: "right",
      title: "Equipe",
      body: "Clique em Equipe.",
      show: workspacePage("team"),
    },
    {
      id: "team-table",
      target: "team-table",
      side: "top",
      title: "Quem atende",
      body: "Todas as pessoas do workspace, as unidades em que atendem e como recebem: comissão ou salário.",
      show: workspacePage("team"),
    },
    ...openUnit,
    {
      id: "unit-tab-cash_flow",
      target: "unit-tab-cash_flow",
      title: "Caixa da unidade",
      body: "Entradas, despesas por grupo, repasse ao parceiro, comissões e o líquido só desta unidade.",
      show: unitPage("cash_flow"),
    },
    {
      id: "unit-tab-stock",
      target: "unit-tab-stock",
      title: "Estoque",
      body: "Os produtos da unidade, as compras e o consumo, que sai sozinho a cada atendimento.",
      show: unitPage("stock"),
    },
  ],
}

const service: Tour = {
  id: "service",
  title: "Atendimento",
  show: (access) => access.inbox || access.canManage,
  steps: [
    {
      id: "nav-inbox",
      target: "nav-inbox",
      sidebar: true,
      side: "right",
      title: "Conversas",
      body: "As mensagens dos clientes chegam aqui para a equipe responder.",
      show: (access) => access.inbox,
    },
    {
      id: "nav-channels",
      target: "nav-channels",
      action: "click",
      href: "/channels",
      sidebar: true,
      side: "right",
      title: "Canais",
      body: "Clique em Canais.",
      show: manages,
    },
    {
      id: "create-channel",
      target: "create-channel",
      title: "Conecte um canal",
      body: "Ligue um número do WhatsApp Business ou uma conta do Instagram ao workspace.",
      show: manages,
    },
  ],
}

// A AgenIA é de quem gerencia, como as URAs e os custos.
const agenia: Tour = {
  id: "agenia",
  title: "AgenIA",
  show: manages,
  steps: [
    {
      id: "agenia-button",
      target: "agenia-button",
      side: "left",
      title: "AgenIA",
      body: "Sua assistente em qualquer página: consulta agenda, caixa, estoque e conversas, e usa a página aberta como contexto.",
    },
    {
      id: "nav-agenia",
      target: "nav-agenia",
      action: "click",
      href: "/agenia",
      sidebar: true,
      side: "right",
      title: "Tela cheia",
      body: "A mesma conversa também tem uma página própria. Clique em AgenIA.",
    },
    {
      id: "agenia-chat",
      target: "agenia-chat",
      side: "left",
      title: "Converse com a AgenIA",
      body: "Pergunte ou peça o que precisar. Antes de mudar algo no sistema, ela pede sua autorização.",
    },
    {
      id: "nav-uras",
      target: "nav-uras",
      action: "click",
      href: "/uras",
      sidebar: true,
      side: "right",
      title: "URAs",
      body: "Clique em URAs.",
    },
    {
      id: "create-ura",
      target: "create-ura",
      title: "Atendimento automático",
      body: "Monte fluxos para os canais: menus, perguntas e agendamento direto pela conversa. No editor, a AgenIA monta e ajusta o fluxo com você.",
    },
    {
      id: "nav-ai-costs",
      target: "nav-ai-costs",
      action: "click",
      href: "/ai-costs",
      sidebar: true,
      side: "right",
      title: "Custos de IA",
      body: "Clique em Custos de IA.",
    },
    {
      id: "agenia-model",
      target: "agenia-model",
      title: "Modelo e gastos",
      body: "Escolha o modelo que a AgenIA usa e acompanhe quanto ela custou em cada período.",
    },
  ],
}

const settings: Tour = {
  id: "settings",
  title: "Configurações",
  steps: [
    {
      id: "nav-users",
      target: "nav-users",
      action: "click",
      href: "/users",
      sidebar: true,
      side: "right",
      title: "Usuários",
      body: "Clique em Usuários.",
      show: workspacePage("users"),
    },
    {
      id: "invite-member",
      target: "invite-member",
      title: "Convide a equipe",
      body: "Convide administradores, recepcionistas e massagistas por email. Cada um entra com a própria conta.",
      show: (access) => access.canManage && access.pages.workspace.includes("users"),
    },
    {
      id: "users-tab-permissions",
      target: "users-tab-permissions",
      title: "Permissões",
      body: "Escolha quais páginas cada função enxerga.",
      show: (access) => access.canManage && access.pages.workspace.includes("users"),
    },
    {
      id: "nav-tickets",
      target: "nav-tickets",
      sidebar: true,
      side: "right",
      title: "Tickets",
      body: "Relate bugs e peça melhorias ao time do agendi.",
    },
  ],
}

export const TOURS: Tour[] = [start, general, service, agenia, settings]
