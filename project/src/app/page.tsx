import type { Metadata } from "next"
import Image from "next/image"
import { ArrowRight, Bot, CalendarCheck, Check } from "lucide-react"
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
  { href: "#parceiros", label: "Parceiros" },
  { href: "#planos", label: "Planos" },
  { href: "#sob-medida", label: "Sob medida" },
]

const PARTNER_RULES = [
  {
    name: "Hotel parceiro",
    cycle: "Mensal",
    rows: [
      ["Até R$ 30.000", "30%"],
      ["Acima de R$ 30.000", "35% do total"],
    ],
  },
  { name: "Clube parceiro", cycle: "Quinzenal", rows: [["Percentual fixo", "15%"]] },
  { name: "Unidade própria", cycle: "Sem ciclo", rows: [["Repasse", "Sem repasse"]] },
]

const FINANCE_POINTS = [
  "Faturamento por unidade e por profissional",
  "Despesas por grupo com limite mensal",
  "Comissões calculadas no fechamento",
  "Resultado do mês de cada unidade e da rede",
]

const lowestPrice = Math.min(...PLANS.map((plan) => plan.prices.standard)) / 100

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
                  Assinar a partir de R$ {lowestPrice}
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

        <section aria-label="Destaque" className="border-b border-ld-line bg-ld-sage-light">
          <Container className="flex flex-col gap-2 py-6 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <p className="text-lg font-semibold tracking-tight text-ld-forest">Uma unidade ou uma rede, na mesma conta.</p>
            <p className="font-mono text-xs font-medium tracking-[0.14em] text-ld-brand uppercase">
              Acesso liberado após o pagamento
            </p>
          </Container>
        </section>

        <section id="recursos" aria-labelledby="recursos-title" className="scroll-mt-16 bg-ld-cream py-20 min-[900px]:py-28">
          <Container className="flex flex-col gap-12">
            <div data-reveal className="flex max-w-3xl flex-col gap-4">
              <Eyebrow>Recursos</Eyebrow>
              <H2 id="recursos-title">Tudo o que o seu negócio usa no dia.</H2>
            </div>
            <Tilt data-reveal="zoom">
              <div className="ld-tilt relative aspect-[4/3] overflow-hidden rounded-xl border border-ld-line bg-white shadow-sm min-[600px]:aspect-[16/8]">
                <Image
                  src="/landing/calendario.webp"
                  alt="Calendário semanal de uma unidade no Agenli, com os agendamentos de cada profissional"
                  fill
                  loading="lazy"
                  quality={90}
                  sizes="(min-width: 1280px) 1200px, 100vw"
                  className="object-cover object-[center_top]"
                />
              </div>
            </Tilt>
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

        <section aria-labelledby="financeiro-title" className="bg-ld-paper py-20 min-[900px]:py-28">
          <Container className="grid grid-cols-1 items-center gap-12 min-[900px]:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
            <div data-reveal className="flex flex-col gap-5">
              <Eyebrow>Financeiro</Eyebrow>
              <H2 id="financeiro-title">Veja o resultado de cada unidade.</H2>
              <p className="text-lg leading-relaxed text-ld-ink-soft">
                Faturamento, despesas por grupo com limite mensal, comissões e o resultado do mês, por unidade e da rede
                inteira.
              </p>
              <ul className="flex flex-col gap-3 pt-2">
                {FINANCE_POINTS.map((point, index) => (
                  <li key={point} data-reveal style={stagger(index + 2)} className="flex items-start gap-3 text-ld-ink">
                    <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ld-brand" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <Tilt data-reveal="zoom" style={stagger(1)}>
              <div className="ld-tilt relative aspect-[1850/990] overflow-hidden rounded-xl border border-ld-line bg-white shadow-sm">
                <Image
                  src="/landing/gastos.webp"
                  alt="Resumo do caixa de uma unidade com o card Gastos por grupo e os limites mensais"
                  fill
                  loading="lazy"
                  quality={90}
                  sizes="(min-width: 1280px) 680px, (min-width: 900px) 55vw, 100vw"
                  className="object-cover object-[center_30%]"
                />
              </div>
            </Tilt>
          </Container>
        </section>

        <section id="parceiros" aria-labelledby="parceiros-title" className="scroll-mt-16 border-y border-ld-line bg-ld-cream py-16 min-[900px]:py-20">
          <Container className="flex flex-col gap-10">
            <div data-reveal className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2 min-[900px]:items-end min-[900px]:gap-16">
              <div className="flex flex-col gap-4">
                <Eyebrow>Parceiros</Eyebrow>
                <h2 id="parceiros-title" className="text-[28px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance min-[900px]:text-[34px]">
                  Opera dentro de outro negócio? O repasse sai sozinho.
                </h2>
              </div>
              <p className="leading-relaxed text-ld-ink-soft">
                Para quem atende dentro de hotéis, clubes, academias ou outros espaços: cadastre a regra do contrato
                (percentual fixo ou faixas por faturamento; ciclo semanal, quinzenal ou mensal) e o Agenli calcula o
                repasse.
              </p>
            </div>
            <ul className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-3">
              {PARTNER_RULES.map((rule, index) => (
                <li
                  key={rule.name}
                  data-reveal
                  style={stagger(index)}
                  className={cn("flex flex-col gap-4 rounded-[10px] border border-ld-line bg-ld-paper p-5", cardHover)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-ld-ink">{rule.name}</h3>
                    <span className="rounded-[4px] bg-ld-sage-light px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide text-ld-brand uppercase">
                      {rule.cycle}
                    </span>
                  </div>
                  <dl className="flex flex-col gap-2 border-t border-ld-line pt-3">
                    {rule.rows.map(([label, value]) => (
                      <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
                        <dt className="text-ld-ink-soft">{label}</dt>
                        <dd className="font-mono font-semibold text-ld-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section id="planos" aria-labelledby="planos-title" className="scroll-mt-16 bg-ld-paper py-20 min-[900px]:py-28">
          <Container className="flex flex-col gap-10">
            <div data-reveal className="flex max-w-3xl flex-col gap-4">
              <Eyebrow>Planos</Eyebrow>
              <H2 id="planos-title">Escolha pelo tamanho da operação.</H2>
            </div>
            <div data-reveal style={stagger(1)}>
              <PlansSection />
            </div>
            <div className="flex flex-col gap-3 text-sm min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
              <p className="font-mono text-xs tracking-wide text-ld-ink-soft uppercase">
                Pagamento via AbacatePay · acesso liberado após a confirmação
              </p>
              <a href="#contato" className={cn("font-medium text-ld-brand underline-offset-4 hover:underline focus-visible:outline-ld-brand", focusRing)}>
                Quer outro formato de plano? Fale com a gente →
              </a>
            </div>
          </Container>
        </section>

        <section id="sob-medida" aria-labelledby="sob-medida-title" className="scroll-mt-16 bg-ld-paper pb-20 min-[900px]:pb-28">
          <Container>
            <div data-reveal="zoom" className="ld-aurora flex flex-col gap-8 rounded-xl border border-ld-line p-8 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between min-[900px]:p-12">
              <div className="flex max-w-3xl flex-col gap-4">
                <Eyebrow>Sob medida</Eyebrow>
                <H2 id="sob-medida-title" className="text-ld-forest min-[900px]:text-[40px]">
                  O sistema não cobre uma particularidade do seu negócio? Desenvolvemos.
                </H2>
                <p className="text-lg leading-relaxed text-ld-ink-soft">
                  Conversamos sobre preço, montamos o plano com você e construímos o que a sua operação precisar.
                </p>
              </div>
              <a
                href="#contato"
                className={cn("inline-flex h-12 shrink-0 items-center justify-center rounded-[6px] bg-ld-brand px-5 text-[15px] font-semibold text-white transition-[background-color,translate,box-shadow] hover:-translate-y-0.5 hover:bg-ld-forest hover:shadow-[0_12px_30px_-10px_rgba(23,63,56,0.6)] focus-visible:outline-ld-brand", focusRing)}
              >
                Conversar sobre o meu caso
              </a>
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
        <Container className="flex items-center gap-2 py-8 text-sm text-ld-mist">
          <LandingLogo className="size-5" />
          Agenli · Gestão para beleza e bem-estar
        </Container>
      </footer>
    </div>
  )
}
