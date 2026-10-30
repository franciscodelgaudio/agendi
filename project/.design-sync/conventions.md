# Agendi — como construir com este design system

Agendi é um SaaS brasileiro de agendamento e gestão (agenda, clientes, serviços, profissionais, caixa, despesas, unidades). Todo texto de interface é em **português do Brasil**; valores em `R$` (`Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`), datas `dd/mm`, horas `14:00`.

## Setup

Tudo está em `window.Agendi`: os 29 componentes, as subpeças (`CardHeader`, `SidebarMenuButton`, `SelectItem`...), os ícones do lucide-react, `toast` (sonner) e os primitivos do recharts. Monte a raiz como o app faz:

```jsx
const { TooltipProvider, Toaster, toast } = window.Agendi
<TooltipProvider>{app}</TooltipProvider>
<Toaster position="top-center" richColors />   // uma vez; dispare com toast.success("Agendamento confirmado.")
```

- `Tooltip` precisa de um `TooltipProvider` ancestral; `Sidebar` precisa de `SidebarProvider` (envolve sidebar + `SidebarInset`).
- Tema escuro: classe `dark` num ancestral (ex.: `<html class="dark">`). Os tokens mudam sozinhos.
- Gatilhos de overlay (Base UI) usam `render`, não `asChild`: `<AlertDialogTrigger render={<Button variant="outline" />}>Excluir</AlertDialogTrigger>`. O mesmo vale para `DropdownMenuTrigger`, `PopoverTrigger`, `SheetTrigger`, `TooltipTrigger`.

## Estilo: utilitários Tailwind com os tokens do tema

Não há CSS por componente para escrever; o layout é feito com classes Tailwind. Só existem as classes já compiladas em `styles.css`, então fique no vocabulário abaixo.

| Família | Classes |
|---|---|
| Superfícies | `bg-background` `bg-card` `bg-muted` `bg-accent` `bg-secondary` `bg-primary` `bg-sidebar` `bg-popover` |
| Texto | `text-foreground` `text-muted-foreground` `text-primary` `text-destructive` `text-primary-foreground` |
| Bordas | `border` `border-b` `border-t` `border-border` `border-input` `ring-ring` `divide-y` |
| Espaço | `gap-*` `p-*` `px-*` `py-*` `space-y-*` (escala 0.5–24), `grid-cols-1..12`, `sm:/md:/lg:/xl:` |
| Tipografia | `text-xs..text-5xl` `font-medium` `font-semibold` `font-mono` `tabular-nums` `truncate` `leading-tight` |
| Gráficos | `var(--chart-1)` … `var(--chart-5)` |

- Fonte: Geist (`font-sans`, padrão do `<html>`), Geist Mono para horários e códigos.
- **Cantos retos**: `--radius` é `0`, então os componentes são quadrados por design. Não adicione `rounded-*` em superfícies; só avatares e indicadores são `rounded-full`.
- Paleta: verde-floresta (`primary`) sobre creme (`background`, `muted`). Use os tokens, nunca hex soltos.
- Ícones: sempre os nomes com sufixo `Icon` (`CalendarIcon`, `UsersIcon`, `Trash2Icon`); os nomes sem sufixo `Calendar`, `Table`, `Sheet`, `Sidebar` e `Badge` são componentes. Dentro de `Button` e `Badge`, marque `data-icon="inline-start"` ou `"inline-end"`.
- Gráficos: primitivos do recharts dentro de `ChartContainer config={{ gasto: { label: "Gasto", color: "var(--chart-1)" } }}`, com `ChartTooltip` + `ChartTooltipContent` e `ChartLegend` + `ChartLegendContent` (`Tooltip` e `Label` do recharts não estão disponíveis porque os nomes pertencem ao DS).
- Tabelas: nunca rolagem horizontal nem quebra de linha em célula. A coluna principal usa `w-full max-w-0 truncate`; em telas menores, esconda colunas inteiras.

## Onde está a verdade

`styles.css` → `_ds_bundle.css` (Tailwind compilado; tokens em `:root` e `.dark`). Para cada componente: `components/<grupo>/<Nome>/<Nome>.prompt.md` (exemplos de composição) e `<Nome>.d.ts` (props). Leia o `.prompt.md` antes de compor uma família, porque as subpeças só aparecem nos exemplos.

## Exemplo

```jsx
const { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, Badge, Button, CalendarPlusIcon } = window.Agendi
<Card className="w-96">
  <CardHeader>
    <CardTitle>Agenda de hoje</CardTitle>
    <CardDescription>4 agendamentos · 2 confirmados</CardDescription>
    <CardAction><Button size="sm"><CalendarPlusIcon data-icon="inline-start" />Agendar</Button></CardAction>
  </CardHeader>
  <CardContent>
    <div className="flex items-center gap-3">
      <span className="w-12 font-mono text-xs text-muted-foreground tabular-nums">09:00</span>
      <div className="flex flex-1 flex-col"><span className="font-medium">Mariana Souza</span>
        <span className="text-xs text-muted-foreground">Corte feminino</span></div>
      <Badge variant="secondary">Confirmado</Badge>
    </div>
  </CardContent>
</Card>
```
