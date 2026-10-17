# ADR-040: CPF como identidade do cliente recorrente

- **Status:** Aceita
- **Data:** 2026-10-17

## Contexto

O modelo de Clientes usava o **telefone**, único dentro da empresa, para evitar cadastros duplicados. O negócio apontou que isso não funciona: um cliente pode ter mais de um telefone.

## Decisão

O cliente recorrente é identificado pelo **CPF**, **único dentro da empresa**. O CPF é um value object que valida os dígitos verificadores. O cliente passa a ter uma **lista de telefones**; o telefone continua servindo para encontrar o cliente, mas não o identifica.

Pela LGPD, o CPF é **dado pessoal comum, não sensível**. Ele é usado com a finalidade de identificar o cliente, fica visível só para quem precisa e é removido na anonimização.

## Consequências

Promover um cliente avulso a recorrente exige o CPF. Clientes sem CPF (por exemplo, estrangeiros hospedados no hotel) ficaram como premissa a confirmar (CL2); por padrão, são atendidos como avulsos. Depois de uma anonimização, o CPF deixa de constar e pode ser cadastrado de novo.

## Alternativas descartadas

Telefone único (um cliente pode ter vários); e-mail (muitos clientes não informam); nenhuma identidade natural, só o ID interno (permitiria duplicados).
