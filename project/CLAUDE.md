@AGENTS.md

## Tabelas responsivas

- **Nunca** pode haver rolagem horizontal em tabelas, em nenhuma largura de tela (inclusive celular).
- **Nunca** quebrar o conteúdo de uma célula em duas linhas para caber.
- Em telas menores, esconda colunas inteiras (`@max-*:hidden`, pelo container da tabela), das menos importantes para as mais importantes. O conteúdo das colunas que aparecem é sempre mostrado inteiro.
- Escolha os breakpoints somando a largura do **pior caso** de cada coluna visível (textos longos, vários badges, valores grandes), não do caso comum. A coluna principal (`w-full max-w-0`, com `truncate`) ocupa o que sobrar.
