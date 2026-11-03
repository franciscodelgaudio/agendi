import { ChevronLeftIcon } from "lucide-react"
import Link from "@/components/shared/link"
import { Button } from "@/components/ui/button"

type Props = {
  title: React.ReactNode
  back?: { href: string; label: string }
  actions?: React.ReactNode
}

export function PageHeader({ title, back, actions }: Props) {
  return (
    <div className="flex min-h-9 flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        {back && (
          <Button variant="ghost" size="icon-sm" nativeButton={false} aria-label={back.label} render={<Link href={back.href} />}>
            <ChevronLeftIcon />
          </Button>
        )}
        <h2 className="truncate text-2xl font-semibold tracking-tight">{title}</h2>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
