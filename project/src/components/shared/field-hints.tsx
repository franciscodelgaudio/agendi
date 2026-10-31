import { CircleHelpIcon } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function RequiredMark() {
  return <span className="text-destructive">*</span>
}

export function OptionalMark() {
  return <span className="font-normal text-muted-foreground">(opcional)</span>
}

export function FieldHelp({ children }: { children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Ajuda"
        className="inline-flex size-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <CircleHelpIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 text-[13px] leading-snug text-pretty">
        {children}
      </PopoverContent>
    </Popover>
  )
}
