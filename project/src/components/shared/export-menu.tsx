"use client"

import { DownloadIcon, FileSpreadsheetIcon, FileTextIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

type Props = {
  href: string
  label: string
}

export function ExportMenu({ href, label }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} title="Exportar" />}>
        <DownloadIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem render={<a href={`${href}/pdf`} download />}>
          <FileTextIcon />
          PDF
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href={`${href}/xlsx`} download />}>
          <FileSpreadsheetIcon />
          Excel (XLSX)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
