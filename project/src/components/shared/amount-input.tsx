"use client"

import { useState, type ChangeEvent, type KeyboardEvent, type ComponentProps } from "react"
import { cn } from "cn"

import { Input } from "@/components/ui/input"
import { currencyFormat } from "@/components/shared/service-format"

const percentFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Valor guardado em centésimos (centavos ou centésimos de ponto percentual).
type Props = Omit<ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "max"> & {
  mode?: "currency" | "percent"
  value?: number | null
  defaultValue?: number | null
  onValueChange?: (hundredths: number | null) => void
  // Em centésimos, como o valor.
  max?: number
}

function format(hundredths: number, mode: "currency" | "percent") {
  return mode === "currency" ? currencyFormat.format(hundredths / 100) : `${percentFormat.format(hundredths / 100)}%`
}

// Campo de valor que se digita como calculadora: cada dígito entra pela direita
// (3 -> 0,03 -> 0,30 -> 3,00). Envia "3.00" num campo oculto, o formato que o servidor espera.
export function AmountInput({
  mode = "currency",
  name,
  value,
  defaultValue = null,
  onValueChange,
  max = Number.MAX_SAFE_INTEGER,
  ...props
}: Props) {
  const [internal, setInternal] = useState(defaultValue)
  const current = value !== undefined ? value : internal

  function commit(next: number | null) {
    if (next !== null && next > max) return
    setInternal(next)
    onValueChange?.(next)
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "")
    commit(digits ? Number(digits) : null)
  }

  // Apagar tira o último dígito, mesmo com "%" ou espaço no fim do texto.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    props.onKeyDown?.(event)
    if (event.key !== "Backspace" || current === null) return
    event.preventDefault()
    const next = Math.floor(current / 10)
    commit(next ? next : null)
  }

  return (
    <>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={current === null ? "" : format(current, mode)}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        // O dígito sempre entra pela direita, então o cursor fica no fim.
        onFocus={(event) => {
          const input = event.currentTarget
          requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length))
          props.onFocus?.(event)
        }}
        className={cn("tabular-nums", props.className)}
      />
      {name && <input type="hidden" name={name} value={current === null ? "" : (current / 100).toFixed(2)} />}
    </>
  )
}
