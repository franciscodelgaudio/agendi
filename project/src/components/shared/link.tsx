"use client"

import NextLink from "next/link"
import { LinkPendingSignal } from "@/components/shared/navigation-progress"

// Link do Next que liga a barra de progresso enquanto a navegação carrega.
export default function Link({ children, ...props }: React.ComponentProps<typeof NextLink>) {
  return (
    <NextLink {...props}>
      {children}
      <LinkPendingSignal />
    </NextLink>
  )
}
