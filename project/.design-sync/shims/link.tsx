// No Claude Design não existe o roteador do Next: o Link de src/components/shared/link.tsx
// (next/link + barra de progresso) vira um <a> simples no bundle do design system.
import * as React from "react"

type Href = string | { pathname?: string | null; hash?: string | null }

export default function Link({
  href,
  children,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  ...props
}: Omit<React.ComponentProps<"a">, "href"> & { href: Href; prefetch?: boolean | null; replace?: boolean; scroll?: boolean }) {
  const url = typeof href === "string" ? href : `${href.pathname ?? ""}${href.hash ? `#${href.hash}` : ""}`
  return (
    <a href={url} {...props}>
      {children}
    </a>
  )
}
