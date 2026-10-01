"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { productNamesAction, searchProductsAction } from "@/lib/actions/product"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"

export type ProductOption = { id: string; unitId?: string; name: string }

type Props = {
  // null enquanto a unidade não foi escolhida; ausente nas páginas de uma unidade, que vem da URL.
  unitId?: string | null
  value: string[]
  onChange: (value: string[]) => void
  emptyMessage?: string
}

// Espera o usuário parar de digitar antes de buscar no servidor.
const SEARCH_DELAY_MS = 250

// Escolha de produtos com busca no servidor: só uma página de resultados por vez, então
// serve para estoques grandes. Envia cada escolhido num campo oculto productId.
// Só registra o uso: não mexe na quantidade em estoque.
export function ProductPicker({ unitId: unitIdProp, value, onChange, emptyMessage = "Nenhum produto encontrado." }: Props) {
  const params = useParams<{ workspaceId: string; unitId?: string }>()
  const { workspaceId } = params
  const unitId = unitIdProp === undefined ? (params.unitId ?? null) : unitIdProp
  const anchor = useComboboxAnchor()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  // Resultados da última busca concluída e a unidade/busca a que se referem.
  const [results, setResults] = useState<{ key: string; products: ProductOption[] }>({ key: "", products: [] })
  // Nomes já conhecidos, para mostrar os escolhidos; os ids sem nome são buscados no servidor.
  const [names, setNames] = useState<Map<string, string>>(new Map())
  // Ids já pedidos ao servidor; os que não voltaram foram excluídos do estoque.
  const [resolved, setResolved] = useState<Set<string>>(new Set())

  const missing = unitId ? value.filter((id) => !names.has(id) && !resolved.has(id)) : []
  const missingKey = missing.join(",")
  useEffect(() => {
    if (!unitId || !missingKey) return
    let ignore = false
    const ids = missingKey.split(",")
    productNamesAction(workspaceId, unitId, ids).then((products) => {
      if (ignore) return
      setNames((current) => new Map([...current, ...products.map((p) => [p.id, p.name] as const)]))
      setResolved((current) => new Set([...current, ...ids]))
    })
    return () => {
      ignore = true
    }
  }, [workspaceId, unitId, missingKey])

  const searchKey = `${unitId}:${query}`
  const loading = results.key !== searchKey
  useEffect(() => {
    if (!unitId || !open) return
    let ignore = false
    const timer = setTimeout(async () => {
      const products = await searchProductsAction(workspaceId, unitId, query)
      if (ignore) return
      setResults({ key: searchKey, products })
      setNames((current) => new Map([...current, ...products.map((p) => [p.id, p.name] as const)]))
    }, SEARCH_DELAY_MS)
    return () => {
      ignore = true
      clearTimeout(timer)
    }
  }, [workspaceId, unitId, open, query, searchKey])

  // Produto excluído do estoque sai da seleção ao salvar.
  const selected = value.filter((id) => names.has(id)).map((id) => ({ id, name: names.get(id)! }))

  return (
    <>
      <Combobox
        multiple
        items={results.products}
        filter={null}
        value={selected}
        onValueChange={(next: ProductOption[]) => onChange(next.map((product) => product.id))}
        inputValue={query}
        onInputValueChange={setQuery}
        open={open}
        onOpenChange={setOpen}
        itemToStringLabel={(product: ProductOption) => product.name}
        isItemEqualToValue={(a: ProductOption, b: ProductOption) => a.id === b.id}
        disabled={!unitId}
      >
        <ComboboxChips ref={anchor} className="w-full">
          <ComboboxValue>
            {(products: ProductOption[]) =>
              products.map((product) => <ComboboxChip key={product.id}>{product.name}</ComboboxChip>)
            }
          </ComboboxValue>
          <ComboboxChipsInput
            placeholder={unitId ? (selected.length ? "" : "Buscar produto...") : "Escolha a unidade primeiro"}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>{loading ? "Buscando..." : emptyMessage}</ComboboxEmpty>
          <ComboboxList>
            {(product: ProductOption) => (
              <ComboboxItem key={product.id} value={product}>
                {product.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {selected.map((product) => (
        <input key={product.id} type="hidden" name="productId" value={product.id} />
      ))}
    </>
  )
}

// Acrescenta os produtos padrão do serviço aos já escolhidos, sem repetir.
export function withServiceProducts(value: string[], service: { productIds: string[] } | undefined) {
  return service ? [...new Set([...value, ...service.productIds])] : value
}
