"use client"

import { DownloadIcon, FileSpreadsheetIcon, FileTextIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type Props = {
  // Rota de export; recebe o formato e a mesma busca da tela (período, filtros e ordenação).
  href: string
  query: Record<string, string>
}

export function ExportMenu({ href, query }: Props) {
  function url(format: "pdf" | "xlsx") {
    const params = new URLSearchParams(Object.entries({ ...query, format }).filter(([, value]) => value))
    return `${href}?${params}`
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <DownloadIcon />
        Exportar
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem render={<a href={url("pdf")} download />}>
          <FileTextIcon />
          PDF
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href={url("xlsx")} download />}>
          <FileSpreadsheetIcon />
          Excel (XLSX)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
