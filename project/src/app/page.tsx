import type { Metadata } from "next"
import Image from "next/image"
import { ArrowRight, Bot, CalendarCheck, CalendarDays, Check, Wallet } from "lucide-react"
import { ContactForm } from "@/components/landing/contact-form"
import { FEATURES } from "@/components/landing/features"
import { LandingLogo } from "@/components/landing/landing-logo"
import { PlansSection } from "@/components/landing/plans-section"
import { ScrollReveal } from "@/components/landing/scroll-reveal"
import { Tilt } from "@/components/landing/tilt"
import { submitLeadAction } from "@/lib/actions/lead"
import { PLANS } from "@/lib/plans"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Agenli · Gestão para beleza e bem-estar",
  description:
    "Agenda, caixa, comissões, estoque e atendimento por WhatsApp e Instagram para salões, clínicas de estética, barbearias, SPAs e studios. De uma unidade a uma rede inteira.",
}

const NAV = [
  { href: "#recursos", label: "Recursos" },
  { href: "#planos", label: "Planos" },
]

const CLIENTS = [
  { name: "Aira Spa", href: "https://airaspa.com.br", logo: "/landing/clientes/aira-spa.png", width: 1243, height: 569 },
]

const SHOWCASE = [
  {
    src: "/landing/calendario.webp",
    alt: "Calendário semanal de uma unidade no Agenli, com os agendamentos de cada profissional",
    icon: CalendarDays,
    title: "Agenda por profissional",
    description: "Todos os agendamentos da unidade em mês, semana, dia ou lista, com uma cor por profissional.",
    points: ["Filtro por profissional", "Novo agendamento em poucos cliques", "Agenda de cada unidade"],
  },
  {
    src: "/landing/gastos.webp",
    alt: "Resumo do caixa de uma unidade com o card Gastos por grupo e os limites mensais",
    icon: Wallet,
    title: "Caixa e comissões",
    description: "Gastos por grupo, planejado contra realizado e o bruto e a comissão de cada profissional no mês.",
    points: ["Limite mensal por grupo de gasto", "Comissão calculada no fechamento", "Resultado de cada unidade"],
  },
]

const lowestMonthlyPrice = (Math.min(...PLANS.map((plan) => plan.monthlyPrice)) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2"
const lightButton = cn(
  "group inline-flex h-12 items-center justify-center gap-2 rounded-[6px] bg-ld-sage-light px-5 text-[15px] font-semibold text-ld-forest transition-colors hover:bg-white focus-visible:outline-ld-sage-light",
  focusRing,
)
const ghostButton = cn(
  "inline-flex h-12 items-center justify-center rounded-[6px] border border-white/25 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-ld-sage-light",
  focusRing,
)

function Eyebrow({ children, onDark = false }: { children: React.ReactNode; onDark?: boolean }) {
  return (
    <p className={cn("font-mono text-xs font-medium tracking-[0.14em] uppercase", onDark ? "text-ld-mist" : "text-ld-brand")}>
      {children}
    </p>
  )
}

function H2({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <h2
      id={id}
      className={cn(
        "text-[32px] leading-[1.1] font-semibold tracking-[-0.03em] text-balance min-[900px]:text-[44px]",
        className,
      )}
    >
      {children}
    </h2>
  )
}

const cardHover =
  "hover:-translate-y-1 hover:border-ld-sage/50 hover:shadow-[0_18px_40px_-20px_rgba(23,63,56,0.35)] transition-[translate,border-color,box-shadow] duration-300"

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties

function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1280px] px-5 min-[900px]:px-10", className)}>{children}</div>
}

export default function LandingPage() {
  return (
    <div className="landing flex min-h-svh flex-col bg-ld-paper text-ld-ink">
      <ScrollReveal />
      <a
        href="#conteudo"
        className="sr-only z-[60] rounded-[6px] bg-white px-4 py-2 text-ld-forest focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-ld-forest/95 backdrop-blur">
        <div aria-hidden="true" className="ld-progress absolute inset-x-0 -bottom-px h-0.5 bg-gradient-to-r from-ld-sage to-ld-sage-light" />
        <Container className="flex h-16 items-center gap-8">
          <a href="#topo" className={cn("flex items-center gap-2 text-lg font-semibold tracking-tight text-white focus-visible:outline-ld-sage-light", focusRing)}>
            <LandingLogo className="size-7" />
            Agenli
          </a>
          <nav aria-label="Seções" className="hidden flex-1 items-center gap-7 min-[900px]:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn("text-sm font-medium text-ld-mist transition-colors hover:text-white focus-visible:outline-ld-sage-light", focusRing)}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 min-[900px]:ml-0">
            <a
              href="/login"
              className={cn("rounded-[6px] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 focus-visible:outline-ld-sage-light", focusRing)}
            >
              Entrar
            </a>
            <a
              href="#planos"
              className={cn("inline-flex h-9 items-center rounded-[6px] bg-ld-sage-light px-4 text-sm font-semibold text-ld-forest transition-colors hover:bg-white focus-visible:outline-ld-sage-light", focusRing)}
            >
              Assinar
            </a>
          </div>
        </Container>
      </header>

      <main id="conteudo">
        {/* Hero: a tela Início sangra pela borda direita e pela de baixo. */}
        <section id="topo" aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-ld-forest text-white">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="ld-grid absolute inset-0" />
            <div className="ld-orb absolute -top-40 -left-32 size-[520px] bg-ld-sage/35" />
            <div className="ld-orb absolute right-[-10%] bottom-[-30%] size-[640px] bg-[#7fb3a2]/25 [animation-delay:-9s]" />
          </div>
          <Container className="grid grid-cols-1 gap-12 pt-16 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] min-[900px]:gap-10 min-[900px]:pt-24">
            <div className="flex flex-col gap-6 min-[900px]:pb-28">
              <div className="ld-enter" style={stagger(0)}>
                <Eyebrow onDark>Salões · Estética · Barbearias · SPAs · Bem-estar</Eyebrow>
              </div>
              <h1
                id="hero-title"
                style={stagger(1)}
                className="ld-enter text-[40px] leading-[1.04] font-semibold tracking-[-0.035em] text-balance min-[900px]:text-[58px]"
              >
                Gestão simples e completa para negócios de beleza e bem-estar.
              </h1>
              <p className="ld-enter max-w-xl text-lg leading-relaxed text-ld-mist" style={stagger(2)}>
                Agenda, caixa, comissões, estoque e atendimento por WhatsApp e Instagram. De uma unidade a uma rede
                inteira.
              </p>
              <div className="ld-enter flex flex-col gap-3 pt-2 min-[600px]:flex-row" style={stagger(3)}>
                <a href="#planos" className={lightButton}>
                  Assinar a partir de {lowestMonthlyPrice}/mês
                  <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-1" />
                </a>
                <a href="#contato" className={ghostButton}>
                  Falar com a gente
                </a>
              </div>
            </div>
            <Tilt className="relative h-[260px] self-end min-[600px]:h-[380px] min-[900px]:h-[500px]">
              <div className="ld-tilt absolute top-0 left-0 w-[720px] origin-left min-[600px]:w-[900px] min-[900px]:w-[1040px]">
                <div className="ld-screen relative aspect-[1850/990] w-full overflow-hidden rounded-tl-xl border-t border-l border-white/15 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]">
                  <Image
                    src="/landing/inicio.webp"
                    alt="Tela Início do Agenli com indicadores do negócio e gráficos de custos"
                    fill
                    priority
                    quality={90}
                    sizes="(min-width: 900px) 1040px, (min-width: 600px) 900px, 720px"
                    className="object-cover object-left-top"
                  />
                  <div aria-hidden="true" className="ld-scan pointer-events-none absolute inset-x-0 top-0 h-1/4" />
                </div>
              </div>
              <div aria-hidden="true" className="ld-parallax absolute inset-0 hidden min-[600px]:block">
                <div
                  className="ld-float absolute top-10 -left-6 flex items-center gap-3 rounded-[10px] border border-white/15 bg-ld-forest/85 px-4 py-3 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.5)] backdrop-blur-md"
                  style={{ "--delay": "1.4s" } as React.CSSProperties}
                >
                  <span className="relative flex size-2.5">
                    <span className="ld-ping absolute inset-0 rounded-full bg-[#7fb3a2]" />
                    <span className="relative size-2.5 rounded-full bg-[#7fb3a2]" />
                  </span>
                  <Bot className="size-4 text-ld-sage-light" />
                  <span className="text-sm font-medium">IA agendou pelo WhatsApp</span>
                </div>
                <div
                  className="ld-float absolute top-[46%] left-[38%] flex items-center gap-3 rounded-[10px] border border-ld-line bg-white px-4 py-3 text-ld-ink shadow-[0_20px_40px_-12px_rgba(0,0,0,0.35)]"
                  style={{ "--delay": "2s" } as React.CSSProperties}
                >
                  <span className="flex size-8 items-center justify-center rounded-[8px] bg-ld-sage-light text-ld-brand">
                    <CalendarCheck className="size-4" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">Novo agendamento</span>
                    <span className="font-mono text-xs text-ld-ink-soft">Hoje · 14:30</span>
                  </span>
                </div>
              </div>
            </Tilt>
          </Container>
        </section>

        <section id="recursos" aria-labelledby="recursos-title" className="scroll-mt-16 bg-ld-cream py-20 min-[900px]:py-28">
          <Container className="flex flex-col gap-12">
            <div data-reveal className="flex max-w-3xl flex-col gap-4">
              <Eyebrow>Recursos</Eyebrow>
              <H2 id="recursos-title">Tudo o que o seu negócio usa no dia.</H2>
            </div>
            {/* Cada tela ao lado do recurso que ela mostra, alternando o lado no desktop. */}
            <div className="flex flex-col gap-12 min-[900px]:gap-20">
              {SHOWCASE.map((item, index) => (
                <div
                  key={item.src}
                  className={cn(
                    "grid grid-cols-1 items-center gap-6 min-[900px]:gap-12",
                    index % 2 === 1
                      ? "min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]"
                      : "min-[900px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]",
                  )}
                >
                  <Tilt data-reveal="zoom" className={cn(index % 2 === 1 && "min-[900px]:order-last")}>
                    <div className="ld-tilt relative aspect-[1850/990] overflow-hidden rounded-xl border border-ld-line bg-white shadow-[0_30px_60px_-24px_rgba(23,63,56,0.35)]">
                      <Image
                        src={item.src}
                        alt={item.alt}
                        fill
                        loading="lazy"
                        quality={90}
                        sizes="(min-width: 1280px) 740px, (min-width: 900px) 60vw, 100vw"
                        className="object-cover object-top"
                      />
                    </div>
                  </Tilt>
                  <div data-reveal style={stagger(1)} className="flex flex-col gap-4">
                    <span className="flex size-11 items-center justify-center rounded-[8px] bg-ld-sage-light text-ld-brand">
                      <item.icon aria-hidden="true" className="size-5" />
                    </span>
                    <h3 className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-ld-ink min-[900px]:text-[28px]">
                      {item.title}
                    </h3>
                    <p className="text-base leading-relaxed text-ld-ink-soft">{item.description}</p>
                    <ul className="flex flex-col gap-2 pt-1">
                      {item.points.map((point) => (
                        <li key={point} className="flex items-center gap-2 text-sm font-medium text-ld-ink">
                          <Check aria-hidden="true" className="size-4 shrink-0 text-ld-brand" />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
            <ul className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }, index) => (
                <li
                  key={title}
                  data-reveal
                  style={stagger(index % 3)}
                  className={cn("group flex gap-4 rounded-[10px] border border-ld-line bg-ld-paper p-5", cardHover)}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-ld-sage-light text-ld-brand transition-[background-color,color,rotate,scale] duration-300 group-hover:scale-110 group-hover:-rotate-6 group-hover:bg-ld-brand group-hover:text-white">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="font-semibold text-ld-ink">{title}</h3>
                    <p className="text-sm leading-relaxed text-ld-ink-soft">{description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section id="clientes" aria-labelledby="clientes-title" className="border-y border-ld-line bg-ld-paper py-8">
          <Container className="flex flex-col items-center gap-5 min-[600px]:flex-row min-[600px]:justify-center min-[600px]:gap-8">
            <h2 id="clientes-title" className="font-mono text-xs font-medium tracking-[0.14em] text-ld-brand uppercase">
              Cliente em destaque
            </h2>
            <span aria-hidden="true" className="hidden h-8 w-px bg-ld-line min-[600px]:block" />
            <ul className="flex flex-wrap items-center justify-center gap-8">
              {CLIENTS.map((client) => (
                <li key={client.name}>
                  <a
                    href={client.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "group block focus-visible:outline-ld-brand",
                      focusRing,
                    )}
                  >
                    <Image
                      src={client.logo}
                      alt={client.name}
                      width={client.width}
                      height={client.height}
                      loading="lazy"
                      sizes="160px"
                      className="h-10 w-auto transition-transform duration-300 group-hover:scale-105"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section id="planos" aria-labelledby="planos-title" className="scroll-mt-16 bg-ld-paper py-20 min-[900px]:py-28">
          <Container className="flex flex-col gap-10">
            <div data-reveal className="flex max-w-3xl flex-col gap-4">
              <Eyebrow>Planos</Eyebrow>
              <H2 id="planos-title">Plano completo ou sob medida para o seu negócio.</H2>
            </div>
            <div data-reveal style={stagger(1)}>
              <PlansSection />
            </div>
          </Container>
        </section>

        <section id="contato" aria-labelledby="contato-title" className="relative isolate scroll-mt-16 overflow-hidden bg-ld-forest py-20 text-white min-[900px]:py-28">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="ld-grid absolute inset-0" />
            <div className="ld-orb absolute -bottom-40 -left-20 size-[480px] bg-ld-sage/30" />
          </div>
          <Container className="grid grid-cols-1 gap-10 min-[900px]:grid-cols-2 min-[900px]:gap-16">
            <div data-reveal className="flex flex-col gap-4">
              <Eyebrow onDark>Contato</Eyebrow>
              <H2 id="contato-title">Assine agora ou fale com a gente primeiro.</H2>
            </div>
            <div data-reveal style={stagger(1)}>
              <ContactForm action={submitLeadAction} />
            </div>
          </Container>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-ld-forest">
        <Container className="flex flex-col gap-6 py-8 text-sm text-ld-mist min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
          <div className="flex items-center gap-2">
            <LandingLogo className="size-5" />
            Agenli · Gestão para beleza e bem-estar
          </div>
          <div className="flex flex-col gap-2 min-[900px]:items-end">
            <div className="flex items-center gap-2">
              Feito por
              <Image src="/landing/triad.png" alt="Triad" width={260} height={96} className="h-5 w-auto" />
            </div>
            <p className="text-xs text-ld-mist/70">
              Triad Soluções Inteligentes · CNPJ 62.262.799/0001-41 · (45) 98835-1168
            </p>
          </div>
        </Container>
      </footer>
    </div>
  )
}
