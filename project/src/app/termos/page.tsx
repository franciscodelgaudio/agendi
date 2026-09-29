import type { Metadata } from "next"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { LandingLogo } from "@/components/landing/landing-logo"
import { TERMS_MARKDOWN } from "@/content/terms"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Termos de Uso · Agenli",
}

export default function TermsPage() {
  return (
    <div className="landing flex min-h-svh flex-col bg-ld-paper text-ld-ink">
      <header className="border-b border-white/10 bg-ld-forest">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center px-5">
          <Link
            href="/"
            className="flex items-center gap-2 text-lg font-semibold tracking-tight text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ld-sage-light"
          >
            <LandingLogo className="size-7" />
            Agenli
          </Link>
        </div>
      </header>
      <main
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-col gap-4 px-5 py-12 leading-relaxed text-ld-ink-soft min-[900px]:py-16",
          "[&_h1]:text-[28px] [&_h1]:leading-tight [&_h1]:font-semibold [&_h1]:tracking-[-0.02em] [&_h1]:text-ld-ink min-[900px]:[&_h1]:text-[36px]",
          "[&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ld-ink",
          "[&_strong]:font-semibold [&_strong]:text-ld-ink",
          "[&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{TERMS_MARKDOWN}</ReactMarkdown>
      </main>
    </div>
  )
}
