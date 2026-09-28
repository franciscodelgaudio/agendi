import type { Metadata } from "next"
import Image from "next/image"
import { ArrowRight, Check } from "lucide-react"
import { ContactForm } from "@/components/landing/contact-form"
import { FEATURES } from "@/components/landing/features"
import { LandingLogo } from "@/components/landing/landing-logo"
import { PlansSection } from "@/components/landing/plans-section"
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
  "inline-flex h-12 items-center justify-center gap-2 rounded-[6px] bg-ld-sage-light px-5 text-[15px] font-semibold text-ld-forest transition-colors hover:bg-white focus-visible:outline-ld-sage-light",
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

function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1280px] px-5 min-[900px]:px-10", className)}>{children}</div>
}

export default function LandingPage() {
  return (
    <div className="landing flex min-h-svh flex-col bg-ld-paper text-ld-ink">
      <a
        href="#conteudo"
        className="sr-only z-[60] rounded-[6px] bg-white px-4 py-2 text-ld-forest focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-50 border-b border-white/10 bg-ld-forest/95 backdrop-blur">
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
        <section id="topo" aria-labelledby="hero-title" className="overflow-hidden bg-ld-forest text-white">
          <Container className="grid grid-cols-1 gap-12 pt-16 min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] min-[900px]:gap-10 min-[900px]:pt-24">
            <div className="flex flex-col gap-6 min-[900px]:pb-28">
              <Eyebrow onDark>Salões · Estética · Barbearias · SPAs · Bem-estar</Eyebrow>
              <h1
                id="hero-title"
                className="text-[40px] leading-[1.04] font-semibold tracking-[-0.035em] text-balance min-[900px]:text-[58px]"
              >
                Gestão simples e completa para negócios de beleza e bem-estar.
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-ld-mist">
                Agenda, caixa, comissões, estoque e atendimento por WhatsApp e Instagram. De uma unidade a uma rede
                inteira.
              </p>
              <div className="flex flex-col gap-3 pt-2 min-[600px]:flex-row">
                <a href="#planos" className={lightButton}>
                  Assinar a partir de R$ {lowestPrice}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </a>
                <a href="#contato" className={ghostButton}>
                  Falar com a gente
                </a>
              </div>
            </div>
            <div className="relative h-[260px] self-end min-[600px]:h-[380px] min-[900px]:h-[500px]">
              <div className="absolute top-0 left-0 aspect-[1850/990] w-[720px] overflow-hidden rounded-tl-xl border-t border-l border-white/15 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)] min-[600px]:w-[900px] min-[900px]:w-[1040px]">
                <Image
                  src="/landing/inicio.webp"
                  alt="Tela Início do Agenli com indicadores do negócio e gráficos de custos"
                  fill
                  priority
                  sizes="(min-width: 900px) 1040px, (min-width: 600px) 900px, 720px"
                  className="object-cover object-left-top"
                />
              </div>
            </div>
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
            <div className="flex max-w-3xl flex-col gap-4">
              <Eyebrow>Recursos</Eyebrow>
              <H2 id="recursos-title">Tudo o que o seu negócio usa no dia.</H2>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-ld-line bg-white shadow-sm min-[600px]:aspect-[16/8]">
              <Image
                src="/landing/calendario.webp"
                alt="Calendário semanal de uma unidade no Agenli, com os agendamentos de cada profissional"
                fill
                loading="lazy"
                sizes="(min-width: 1280px) 1200px, 100vw"
                className="object-cover object-[center_top]"
              />
            </div>
            <ul className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex gap-4 rounded-[10px] border border-ld-line bg-ld-paper p-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[8px] bg-ld-sage-light text-ld-brand">
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
          <Container className="grid grid-cols-1 items-center gap-12 min-[900px]:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="flex flex-col gap-5">
              <Eyebrow>Financeiro</Eyebrow>
              <H2 id="financeiro-title">Veja o resultado de cada unidade.</H2>
              <p className="text-lg leading-relaxed text-ld-ink-soft">
                Faturamento, despesas por grupo com limite mensal, comissões e o resultado do mês, por unidade e da rede
                inteira.
              </p>
              <ul className="flex flex-col gap-3 pt-2">
                {FINANCE_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-3 text-ld-ink">
                    <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ld-brand" />
                    {point}
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-ld-line bg-white shadow-sm">
              <Image
                src="/landing/gastos.webp"
                alt="Resumo do caixa de uma unidade com o card Gastos por grupo e os limites mensais"
                fill
                loading="lazy"
                sizes="(min-width: 1280px) 680px, (min-width: 900px) 55vw, 100vw"
                className="object-cover object-[center_30%]"
              />
            </div>
          </Container>
        </section>

        <section id="parceiros" aria-labelledby="parceiros-title" className="scroll-mt-16 border-y border-ld-line bg-ld-cream py-16 min-[900px]:py-20">
          <Container className="grid grid-cols-1 gap-10 min-[900px]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] min-[900px]:items-center">
            <div className="flex flex-col gap-4">
              <Eyebrow>Parceiros</Eyebrow>
              <h2 id="parceiros-title" className="text-[28px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance min-[900px]:text-[34px]">
                Opera dentro de outro negócio? O repasse sai sozinho.
              </h2>
              <p className="leading-relaxed text-ld-ink-soft">
                Para quem atende dentro de hotéis, clubes, academias ou outros espaços: cadastre a regra do contrato
                (percentual fixo ou faixas por faturamento; ciclo semanal, quinzenal ou mensal) e o Agenli calcula o
                repasse.
              </p>
            </div>
            <ul className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-3">
              {PARTNER_RULES.map((rule) => (
                <li key={rule.name} className="flex flex-col gap-4 rounded-[10px] border border-ld-line bg-ld-paper p-5">
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
            <div className="flex max-w-3xl flex-col gap-4">
              <Eyebrow>Planos</Eyebrow>
              <H2 id="planos-title">Escolha pelo tamanho da operação.</H2>
            </div>
            <PlansSection />
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
            <div className="flex flex-col gap-8 rounded-xl border border-ld-line bg-ld-sage-light p-8 min-[900px]:flex-row min-[900px]:items-end min-[900px]:justify-between min-[900px]:p-12">
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
                className={cn("inline-flex h-12 shrink-0 items-center justify-center rounded-[6px] bg-ld-brand px-5 text-[15px] font-semibold text-white transition-colors hover:bg-ld-forest focus-visible:outline-ld-brand", focusRing)}
              >
                Conversar sobre o meu caso
              </a>
            </div>
          </Container>
        </section>

        <section id="contato" aria-labelledby="contato-title" className="scroll-mt-16 bg-ld-forest py-20 text-white min-[900px]:py-28">
          <Container className="grid grid-cols-1 gap-10 min-[900px]:grid-cols-2 min-[900px]:gap-16">
            <div className="flex flex-col gap-4">
              <Eyebrow onDark>Contato</Eyebrow>
              <H2 id="contato-title">Assine agora ou fale com a gente primeiro.</H2>
            </div>
            <ContactForm action={submitLeadAction} />
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
