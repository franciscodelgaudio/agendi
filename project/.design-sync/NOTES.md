# design-sync — notas do repositório Agendi

Sync do design system (`src/components/ui`, shadcn estilo `base-vega` sobre `@base-ui/react`) com o projeto
"Agendi Design System" no Claude Design. Rodar tudo a partir de `project/` (onde está o `package.json`).

## Como o build funciona aqui

- **Não há `dist/`**: o Agendi é um app Next.js. O conversor sintetiza a entrada a partir de `cfg.srcDir`
  (`src/components/ui`). Ele exige `--entry` para achar o `package.json`, então passe um caminho que **não existe**:
  `--entry ./.design-sync/no-dist` (o `[NO_DIST] ... doesn't exist` no log é esperado).
- **Lista de componentes = `componentSrcMap`** (29 famílias, uma por arquivo de `ui/`). Com qualquer entrada não nula
  nesse mapa o conversor deixa de derivar componentes do `src/`, então o mapa precisa listar TODAS as famílias.
  Subpeças (CardHeader, SidebarMenuButton...) continuam no bundle via `export *`, só não ganham card próprio
  (decisão do usuário: 29 cards, não 164). Arquivo novo em `ui/` → adicionar a família no mapa e no `docsMap`.
- **Grupos** vêm de stubs em `.design-sync/groups/*.md` (só frontmatter `category`) apontados pelo `docsMap`.
- **CSS**: o `globals.css` é fonte Tailwind v4. `cfg.buildCmd` compila `.design-sync/tailwind.css` →
  `.design-sync/.cache/agendi.css` (= `cssEntry`) com o `@tailwindcss/cli` 4.3.3 instalado em `.ds-sync/`.
  Ele varre `src/`, `.design-sync/previews/` e uma lista `@source inline(...)` de utilitários comuns.
  **Rode o `buildCmd` antes do `package-build.mjs`** sempre que prévias ou o app mudarem — classes que só
  aparecem numa prévia nova não existem no CSS até recompilar.
- **Fontes**: Geist e Geist Mono vêm do `next/font` no app; aqui são os woff2 variáveis do pacote npm `geist`
  (OFL) em `.design-sync/fonts/` via `extraFonts`. O `tailwind.css` define `--font-geist-sans/mono` no `:root`.
- **`next/link`**: `PaginationLink` usa `@/components/shared/link` (next/link), que quebra o bundle
  (`ReferenceError: process is not defined`). `.design-sync/tsconfig.json` (= `cfg.tsconfig`) mapeia esse
  import para `.design-sync/shims/link.tsx` (um `<a>`). O código do app não muda.
- **Ícones**: `lucide-react` entra via `extraEntries` (+1,4 MB no bundle). Colidem com componentes:
  `Badge`, `Calendar`, `Sheet`, `Sidebar`, `Table` — o componente do DS vence. Nas prévias e no agente,
  use sempre os nomes com sufixo `Icon` (`CalendarIcon`, `TableIcon`...).
- **`sonner` e `recharts` também estão em `extraEntries`**: as prévias importam `toast` e os primitivos de gráfico
  direto desses pacotes; sem o shim para `window.Agendi` cada prévia empacota uma segunda cópia e o
  `<Toaster />`/`ChartContainer` do DS (que usam a cópia do bundle) ficam em branco (store do sonner e
  `ResponsiveContainerContext` do recharts são por instância). Colisões em que o DS vence: `Toaster` (sonner),
  `Label`/`Tooltip`/`Legend` (recharts) — nas prévias use `ChartTooltip`/`ChartLegend` de `"agendi"`.
- Playwright 1.63.0 (em `.ds-sync/`) bate com o chromium-1243 em cache em `%LOCALAPPDATA%\ms-playwright`.
- `tsconfig.json` e `eslint.config.mjs` do app ignoram `.ds-sync/`, `ds-bundle/` e `.design-sync/`.

## Tema

- `--radius: 0` — todos os `rounded-*` dos componentes resultam em cantos retos. É a marca, não bug.
- Paleta verde-floresta/creme em oklch; tema escuro pela classe `.dark` num ancestral.
- `Card size="sm"` força `text-sm` no `CardTitle` (seletor `group-data`); valores grandes vão no `CardContent`.

## Escrevendo prévias (`.design-sync/previews/<Name>.tsx`)

- Cards `cardMode: "single"` mostram o `primaryStory` (sem ele, a 1ª exportação em ordem ALFABÉTICA).
- Overlays abrem estáticos com `defaultOpen` no root do Base UI (inclusive submenus e vários tooltips).
  Modais focam o 1º botão (anel verde) — comportamento real.
- Select aberto: `<SelectContent alignItemWithTrigger={false}>`, senão o popup cobre o trigger e corta a lista.
  `SelectValue` só mostra o rótulo se o `Select` receber `items`.
- Calendar: `locale={ptBR}` de `react-day-picker/locale` e `today={new Date(2026, 9, 29)}` fixo, para a captura
  não depender do relógio da máquina.
- Combobox: `defaultInputValue` + `defaultOpen` mostra o `ComboboxEmpty`; com `showClear` o chevron some (estilo).
- FileDropzone: `data-dragging="true"` mostra o estado de arrastar; `onFile` é obrigatório (noop).
- Label desabilitado fora de Field: wrapper com `group` + `data-disabled="true"` (`peer-disabled` não pega o
  Checkbox do Base UI, que é um span).
- Sidebar: a captura `?story=` mantém o padding de 24px do body e corta o rodapé de um shell `min-h-svh`;
  a prévia usa `SidebarProvider` com `height: calc(100svh - 24px)` + `min-h-0` e `<Sidebar className="h-full">`
  (deixa uma faixa de 24px no render full-bleed do produto).
- Popover com Calendar + linha "Hoje / Todo o período" não cabe em 640x420 (vai para o lado); a prévia omite a linha.
- Para checar se uma classe existe no CSS compilado use `grep -F` com a forma escapada
  (ex.: `grep -cF '.bg-background\/60{' .design-sync/.cache/agendi.css`) — regex dá falso negativo.
  Ausentes até hoje: `w-[36rem]`, `data-vertical:self-center` (as prévias contornaram).
- Avatares ficam redondos (`rounded-full`) mesmo com `--radius: 0`; badges ficam retos.
- Skeleton é sutil por natureza (`bg-muted` creme sobre fundo creme) — não é defeito.
- Escreva prévias com a ferramenta Write; heredoc do Git Bash quebra com muitas aspas/crases.

## Known render warns

- `[TOKENS_MISSING] --available-height, --anchor-width, --available-width, --transform-origin, --tw`:
  variáveis definidas em runtime pelo Base UI (posicionamento de popups) e internas do Tailwind. Esperado.
- `[RENDER_THIN] Toaster ... rendered height is 0px`: os toasts do sonner são `position: fixed`, então a raiz
  mede 0px; a captura mostra os toasts normalmente. Benigno.
- `[EXPORT_COLLISION]` de `sonner` (Toaster), `recharts` (Tooltip, Label) e `./.design-sync/globals.ts`
  (AreaChart, BarChart...): esperados — o DS vence nos dois primeiros e o `globals.ts` aponta para o mesmo recharts.

## Re-sync risks

- **Build lento**: com `globals.ts` (lucide + recharts) o `package-build.mjs` passa de 10 min (análise de tipos).
  Rode em segundo plano.
- **Notas visuais dependem do `extraEntries`**: mudar `extraEntries`/`globals.ts` muda a resolução de imports das
  prévias e zera todas as notas — conte com reavaliar as 29 folhas.
- **Lista fechada de famílias**: `componentSrcMap` + `docsMap` enumeram as 29 famílias. Um arquivo novo em
  `src/components/ui/` não aparece até ser adicionado nos dois (as subpeças entram no bundle sozinhas).
- **Colisões lucide × recharts** estão fixadas à mão em `.design-sync/globals.ts`; ao atualizar um dos dois
  pacotes, rode a checagem de interseção de exports de novo (nomes novos em comum ficam `undefined`).
- **Shim do Link** (`.design-sync/shims/link.tsx`) substitui `@/components/shared/link`; se o `PaginationLink`
  passar a importar outra coisa do Next, o bundle volta a quebrar com `process is not defined`.
- **Fontes**: Geist vem do pacote npm `geist` 1.8.2, não do `next/font`; se o app trocar de fonte, troque aqui.
- **Prévias com dados fixos**: Calendar/Popover usam outubro de 2026 e `today` fixo — de propósito.
- **Viewports**: Select/Combobox em 800px (tamanho desktop); Sidebar compensa o padding de 24px da captura.
