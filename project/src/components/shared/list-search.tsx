"use client"

import { useEffect, useState } from "react"
import { SearchIcon } from "lucide-react"
import { useNavigationPending, useReplaceQuery } from "@/components/shared/navigation-progress"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

const DEBOUNCE_MS = 300

type Props = {
  // q é a busca; os demais campos (ordenação, data...) são preservados na URL.
  query: { q: string } & Record<string, string>
  placeholder: string
}

// Busca com debounce que preserva os outros parâmetros atuais da URL.
export function ListSearch({ query, placeholder }: Props) {
  const replaceQuery = useReplaceQuery()
  const pending = useNavigationPending()
  const [value, setValue] = useState(query.q)

  useEffect(() => {
    const q = value.trim()
    if (q === query.q) return
    const timeout = setTimeout(() => replaceQuery({ ...query, q }), DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [value, query, replaceQuery])

  return (
    <div className="relative w-full max-w-sm">
      {pending ? (
        <Spinner className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
      ) : (
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      )}
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder.replace(/\.+$/, "")}
        className="pl-8"
      />
    </div>
  )
}
