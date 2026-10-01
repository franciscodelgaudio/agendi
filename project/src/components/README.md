# Organização dos componentes

Os componentes de uma página ficam no caminho correspondente ao de `src/app`, mantendo os grupos de rotas, segmentos dinâmicos e slots do App Router. Por exemplo:

- `app/(auth)/login/page.tsx` → `components/(auth)/login/login-form.tsx`.
- `app/workspace/[workspaceId]/users/permissions/page.tsx` → `components/workspace/[workspaceId]/users/permissions/role-permissions-form.tsx`.
- `app/workspace/[workspaceId]/unit/[unitId]/stock/[productId]/page.tsx` → `components/workspace/[workspaceId]/unit/[unitId]/stock/[productId]/product-history-table.tsx`.
- `app/workspace/[workspaceId]/@sidebar/default.tsx` → `components/workspace/[workspaceId]/@sidebar/app-sidebar.tsx`.

Componentes usados pelo layout ficam no diretório correspondente àquele layout. Formulários, ações, tabelas e auxiliares específicos de uma página ficam juntos na pasta da funcionalidade.

## Componentes compartilhados

- `ui/`: primitivas de interface do shadcn, como botões, inputs, tabelas e sheets.
- `shared/`: componentes reutilizáveis entre áreas da aplicação, como paginação, campos, filtros de query, links, navegação e skeletons. `shared/landing/` reúne elementos usados na página inicial, na seleção de workspace e nos termos.
- `workspace/[workspaceId]/shared/`: componentes de domínio usados por diferentes rotas do workspace. As pastas `calendar`, `cash-flow`, `stock` e `team` atendem tanto à visão geral do workspace quanto à visão de uma unidade; `messaging` compartilha os elementos de plataformas entre canais e conversas.

Antes de adicionar um componente, escolha a rota responsável por ele. Quando houver reutilização entre rotas, use a pasta compartilhada mais próxima que represente seu escopo. As pastas dentro de `components` organizam código e não criam rotas.

Use imports diretos pelo alias `@/components/...`, sem arquivos intermediários para reexportar os caminhos antigos.
