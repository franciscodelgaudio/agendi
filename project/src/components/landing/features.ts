import {
  Bot,
  Building2,
  CalendarCheck,
  CalendarDays,
  Camera,
  Contact,
  Handshake,
  Package,
  Percent,
  Sparkles,
  Wallet,
  Webhook,
  type LucideIcon,
} from "lucide-react"

export type Feature = { icon: LucideIcon; title: string; description: string }

export const FEATURES: readonly Feature[] = [
  { icon: CalendarDays, title: "Agenda por profissional", description: "Dia, semana e lista, com a agenda de cada profissional e sala." },
  { icon: Contact, title: "Clientes", description: "Histórico de atendimentos, contato e observações de cada cliente." },
  { icon: Sparkles, title: "Serviços e produtos", description: "Duração, preço e produtos usados em cada serviço." },
  { icon: Package, title: "Estoque", description: "Entradas, consumo por atendimento e histórico de cada produto." },
  { icon: Wallet, title: "Financeiro", description: "Caixa, despesas por grupo com limite mensal e o resultado de cada unidade." },
  { icon: Percent, title: "Comissões por profissional e unidade", description: "Regras por profissional e por unidade, calculadas no fechamento." },
  { icon: Handshake, title: "Profissional parceiro", description: "Quem atende como parceiro, com repasse calculado à parte." },
  { icon: Building2, title: "Múltiplas unidades", description: "Cada unidade com equipe, agenda e caixa, e a visão da rede toda." },
  { icon: Bot, title: "IA pelo WhatsApp", description: "Atendimento automático que responde e agenda pelo WhatsApp." },
  { icon: Camera, title: "Instagram integrado", description: "Mensagens do Instagram na mesma caixa de entrada da equipe." },
  { icon: CalendarCheck, title: "Agendamento público", description: "Link para o cliente escolher serviço, profissional e horário." },
  { icon: Webhook, title: "API e webhooks", description: "Integre o Agenli aos sistemas que o seu negócio já usa." },
]
