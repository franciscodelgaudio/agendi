# Serviços e regras de negócio

As pastas espelham as rotas de páginas de `src/app`, incluindo os segmentos
dinâmicos `[workspaceId]` e `[unitId]`. Esses nomes organizam o código; os IDs
continuam sendo recebidos como argumentos das funções.

Coloque cada serviço na pasta da página responsável por sua funcionalidade.
Serviços compartilhados entre abas ficam na rota pai. Outras páginas, actions,
rotas de API e workers podem importar o mesmo serviço sem duplicar consultas.

Exemplos:

- `workspace/[workspaceId]/uras/ura-store.ts`: persistência e execução das URAs.
- `workspace/[workspaceId]/agenia/`: modelo, contexto e histórico da AgenIA.
- `workspace/[workspaceId]/stock/products/product-lookup.ts`: consultas de produtos.
- `workspace/[workspaceId]/unit/[unitId]/calendar/booking-store.ts`: consultas de agendamentos.
- `workspace/[workspaceId]/unit/[unitId]/cash-flow/`: consultas das abas do caixa da unidade.

O acesso compartilhado ao workspace fica em `workspace/[workspaceId]`; o acesso
à unidade fica em `workspace/[workspaceId]/unit/[unitId]`.
Validações, tipos, filtros e regras de negócio ficam junto dos serviços da
funcionalidade correspondente. Esses módulos também podem ser usados por
componentes de cliente quando não dependem de banco ou de APIs do servidor.

Infraestrutura e utilitários gerais ficam em `_shared`, com subpastas para banco,
armazenamento e segurança. Autenticação fica em `(auth)`, assinatura em
`subscribe` e validação de webhooks em `api/webhooks`, seguindo as rotas de `src/app`.

As server actions continuam em `src/lib/actions` e os testes existentes em
`src/lib/tests`. A raiz de `src/lib` não contém mais módulos soltos.
