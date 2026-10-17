# Clientes

| | |
|---|---|
| **Classificação** | 🟢 Generic |
| **Subdomínio** | Relacionamento com Clientes |
| **Situação** | ✅ Modelagem definida (com premissas a confirmar: CL1, CL2) |

## Propósito

Manter o cadastro de **clientes recorrentes**, usado por Atendimento, Vendas e Cobrança. Atendimentos e vendas também aceitam **clientes avulsos** (nome e telefone), sem cadastro.

## Modelo

![Modelo de Catálogo e Clientes](../diagramas/catalogo-clientes-modelo.drawio.svg)

> O diagrama ainda mostra o telefone como identificação do cliente. O texto abaixo é a referência até o diagrama ser atualizado.

## Agregado

```
Cliente (Aggregate Root)
  id, empresaId
  nome
  cpf: CPF                       único dentro da empresa; identifica o cliente (ADR-040)
  telefones: Telefone[]          um cliente pode ter vários; servem para encontrá-lo, não para identificá-lo
  email?
  observacoes?                   preferências de atendimento
  consentimentos: Consentimento[]    finalidade, concedidoEm, revogadoEm?

  atualizarContato(...)
  adicionarTelefone(telefone) · removerTelefone(telefone)
  registrarConsentimento(finalidade)
  revogarConsentimento(finalidade)
  anonimizar()                   atende a pedido de exclusão (LGPD) sem quebrar o histórico

CPF (Value Object)               11 dígitos com dígitos verificadores válidos
```

## Invariantes

- **O CPF é obrigatório e único dentro da empresa** ([ADR-040](../adr/040-cpf-como-identidade-do-cliente.md)). É ele que evita cadastros duplicados. O telefone **não** serve para isso, porque um cliente pode ter mais de um.
- Um cliente anonimizado não tem CPF, nome nem telefones; o CPF fica livre para um novo cadastro.

## Regras

- **Promover um avulso a recorrente** exige o CPF e cria um cliente novo com os dados informados; atendimentos e vendas antigos continuam como estavam ([ADR-008](../adr/008-snapshot-das-regras-no-momento-do-fato.md)).
- Cliente **sem CPF** (por exemplo, um estrangeiro hospedado no hotel) é atendido como **avulso** (premissa CL2).
- O **quarto não fica no cadastro do cliente**: ele muda a cada hospedagem e é informado no atendimento ([ADR-041](../adr/041-quarto-obrigatorio-so-com-parceiro.md)).
- Os outros contextos guardam o `clienteId` e **uma cópia do nome**.
- Comunicações (lembrete de agendamento, promoções) exigem **consentimento** para a finalidade.
- Um pedido de exclusão **anonimiza** o cliente: nome, CPF e contatos são removidos, e os registros financeiros e de atendimento continuam válidos, sem identificá-lo.

## CPF e a LGPD

O CPF é **dado pessoal comum**, não sensível. Mesmo assim, segue as regras gerais da LGPD: é coletado com uma **finalidade** clara (identificar o cliente e evitar cadastros duplicados), aparece só para quem precisa dele e é removido na anonimização.

## Atenção: dados de saúde (CL1)

SPAs costumam registrar **contraindicações** (gestação, alergias, problemas de circulação) antes de uma massagem. Pela LGPD, isso é **dado pessoal sensível**: exige consentimento específico, acesso restrito e cuidados extras.

Se o sistema for guardar essa **ficha de anamnese**, ela não deve ficar em `observacoes`. O ideal é um conceito próprio (`FichaDeAnamnese`), com acesso controlado e consentimento registrado, e talvez até um contexto próprio. O modelo atual **não guarda dados de saúde**.

## Eventos publicados

`ClienteCadastrado` · `ContatoAtualizado` · `ClienteAnonimizado`

Consumidores: Atendimento e Vendas (cópia do nome); `ClienteAnonimizado` faz todos os contextos removerem a cópia do nome.
