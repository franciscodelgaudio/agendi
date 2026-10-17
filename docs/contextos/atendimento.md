# Atendimento

| | |
|---|---|
| **Classificação** | 🔴 Core |
| **Subdomínio** | Operação de Atendimento |
| **Situação** | ✅ Modelagem tática definida |

## Propósito

Agendar atendimentos garantindo a disponibilidade de profissionais e salas, conduzir o ciclo de vida de cada atendimento e **publicar os desfechos com suas consequências já calculadas** para os demais contextos.

É a **fonte dos eventos** de todo o sistema. Agenda e Atendimento formam um único contexto com dois agregados ([ADR-005](../adr/005-agenda-e-atendimento-no-mesmo-contexto.md)).

## Ciclo de vida

![Estados do Atendimento](../diagramas/atendimento-estados.drawio.svg)

## Modelo

![Modelo do Atendimento](../diagramas/atendimento-modelo.drawio.svg)

## 1. Comandos e eventos

| Comando | Ator | Evento |
|---|---|---|
| Agendar Atendimento | Recepcionista | AtendimentoAgendado |
| Reagendar Atendimento | Recepcionista | AtendimentoReagendado |
| Cancelar Atendimento | Recepcionista | AtendimentoCancelado |
| Registrar No-show | Recepcionista | NoShowRegistrado |
| Concluir Atendimento | Recepcionista | AtendimentoConcluido |
| Definir Política de Cancelamento | Gestor | PoliticaDeCancelamentoDefinida |
| Cadastrar Sala | Gestor | SalaCadastrada |

## 2. Invariantes

**Na agenda**
- Um profissional não pode ter dois atendimentos com horários sobrepostos, **em nenhuma unidade da empresa**.
- Uma sala não pode ter dois atendimentos com horários sobrepostos.

**No atendimento**
- Só um atendimento **agendado** pode ser concluído, cancelado, reagendado ou marcado como no-show.
- Concluído, cancelado e no-show são **estados finais**.
- O atendimento guarda o **previsto** e o **realizado**, que podem ser diferentes.
- A política de cancelamento aplicada é a **vigente no agendamento** ([ADR-008](../adr/008-snapshot-das-regras-no-momento-do-fato.md)).
- O **valor cobrado nunca é negativo** (o desconto não tem limite, mas não pode ultrapassar o preço).

## 3. Agregados

### AgendaDaEmpresa (por empresa e por dia)

Responde a uma única pergunta: *este horário está livre para este profissional e esta sala?* É por empresa porque um profissional pode atender em duas unidades no mesmo dia ([ADR-006](../adr/006-agenda-por-empresa-e-dia.md)).

```
AgendaDaEmpresa (Aggregate Root)
  empresaId: EmpresaId
  data: Data
  versao                                ← concorrência otimista
  reservas: Reserva[]

  reservar(atendimentoId, unidadeId, profissionalId, salaId, intervalo)
    se intervalo do profissional ou da sala se sobrepõe → HorarioIndisponivel
  remanejar(atendimentoId, novoIntervalo, novoProfissional?, novaSala?)
  liberar(atendimentoId)

Reserva (Entity)
  atendimentoId, unidadeId, profissionalId, salaId, intervalo
```

**Concorrência:** se duas recepcionistas salvarem ao mesmo tempo, o serviço de aplicação recarrega o agregado e tenta de novo. A recepcionista só vê erro se o horário realmente tiver sido ocupado.

### Atendimento

```
Atendimento (Aggregate Root)
  id: AtendimentoId
  unidadeId: UnidadeId
  cliente: ClienteDoAtendimento
  previsto: ServicoPrevisto
  realizado: ServicoRealizado?
  politica: PoliticaDeCancelamento      ← snapshot do agendamento
  situacao: Agendado | Concluido | Cancelado | NoShow

  reagendar(intervalo)
  concluir(realizado)              exige Agendado → AtendimentoConcluido
  cancelar(momento, motivo)        exige Agendado → AtendimentoCancelado(consequência)
  registrarNoShow()                exige Agendado → NoShowRegistrado(consequência)
```

Não existe `setSituacao`: cada mudança de estado é um método com nome de negócio.

**Agendar envolve os dois agregados.** O comando reserva o horário na `AgendaDaEmpresa` e cria um `Atendimento` novo na mesma transação. É uma exceção aceitável à regra de "um agregado por transação", porque criar um agregado novo não gera disputa. A conclusão com profissional ou duração diferente atualiza a agenda **depois**, via evento.

## 4. Value Objects

```
Intervalo                inicio, fim; sobrepoe(outro); duracao()

ServicoPrevisto          tipoServicoId, profissionalId, salaId, intervalo,
                         precoDeTabela (snapshot do Catálogo)

ServicoRealizado         tipoServicoId, profissionalId, duracao,
                         precoDeTabela, desconto?
                         valorCobrado() = precoDeTabela − desconto (≥ 0)

Desconto                 valor | percentual, motivo, concedidoPor

ClienteDoAtendimento     Avulso(nome, telefone?, quarto?)
                       | Recorrente(clienteId, nome)       ← nome copiado para o histórico

PoliticaDeCancelamento   antecedenciaMinima
                         cobrancaNoCancelamentoTardio: Nada | Percentual(x) | Integral
                         cobrancaNoNoShow:             Nada | Percentual(x) | Integral
                         remunerarProfissional:        Nao | Sim | ProporcionalACobranca
                         avaliarCancelamento(previsto, momento): ConsequenciaDoDesfecho
                         avaliarNoShow(previsto): ConsequenciaDoDesfecho

ConsequenciaDoDesfecho   valorACobrar, baseDeRemuneracao
```

Toda a lógica de "cobra ou não, remunera ou não" fica na `PoliticaDeCancelamento` e é testável isoladamente.

## 5. Eventos publicados (contrato)

```
AtendimentoConcluido
  atendimentoId, unidadeId, profissionalId, tipoServicoId,
  precoDeTabela, desconto, valorCobrado, duracao, concluidoEm

AtendimentoCancelado
  atendimentoId, unidadeId, profissionalId,
  valorACobrar, baseDeRemuneracao, canceladoEm

NoShowRegistrado
  atendimentoId, unidadeId, profissionalId,
  valorACobrar, baseDeRemuneracao, registradoEm
```

Os eventos carregam as **consequências já calculadas** ([ADR-007](../adr/007-eventos-com-consequencias-calculadas.md)).

| Consumidor | Reação |
|---|---|
| Cobrança | Cobra `valorCobrado` ou `valorACobrar` |
| Remuneração | Comissão sobre `valorCobrado` ou `baseDeRemuneracao` |
| Estoque | Baixa teórica pela ficha técnica do `tipoServicoId` |
| Liquidação com Parceiro | Reage à **cobrança**, não ao atendimento |

## 6. Repositórios e serviços de aplicação

```
Repositórios
  AgendaDaEmpresaRepository     porEmpresaEData(empresaId, data)
  AtendimentoRepository         porId(id)
  PoliticaRepository            vigente(unidadeId, data)

Serviços de aplicação
  AgendarAtendimento     política vigente + preço de tabela → reserva → cria Atendimento
  ReagendarAtendimento
  CancelarAtendimento    cancela → libera horário
  RegistrarNoShow
  ConcluirAtendimento    verifica permissão para desconto (role) → conclui
```

Serviços de aplicação só orquestram. Permissões por role são verificadas aqui, **fora do domínio** ([ADR-014](../adr/014-desconto-explicito-permissoes-fora-do-dominio.md)).

## 7. Testes de domínio

- Reservar profissional em horário sobreposto, **mesmo em outra unidade**, gera `HorarioIndisponivel`.
- Reservar a mesma sala em horário sobreposto gera erro; salas diferentes no mesmo horário são permitidas.
- Concluir um atendimento cancelado gera erro.
- Desconto maior que o preço de tabela gera erro (valor cobrado negativo).
- Cancelamento dentro da antecedência mínima não gera cobrança.
- Cancelamento tardio com `Percentual(50%)` gera `valorACobrar` igual à metade do preço de tabela.
- Mudar a política depois do agendamento não afeta o atendimento já agendado.

## Pendências

Veja [Pendências](../05-pendencias.md): premissas A1 e A2.
