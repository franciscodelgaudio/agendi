"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// Recarrega os dados do servidor a cada intervalMs enquanto estiver montado.
export function AutoRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])
  return null
}
