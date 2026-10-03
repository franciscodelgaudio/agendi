import { describe, it, expect, vi } from "vitest";
import { parseUraGraph } from "@/service/workspace/[workspaceId]/uras/ura-graph";
import { walkUra } from "@/service/workspace/[workspaceId]/uras/ura-walk";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60719";
const SERVICE_ID = "64b7f0c2a1b2c3d4e5f60720";
const USER_ID = "64b7f0c2a1b2c3d4e5f60721";
// Segunda, 28/09/2026, 09:30 em Brasília.
const NOW = new Date("2026-09-28T12:30:00.000Z");
const MINUTE = 60 * 1000;

const builtins = { contato_nome: "Maria Clara", contato_primeiro_nome: "Maria", hora_atual: "09:30" };

type N = { id: string; type: string; data?: Record<string, unknown> };
type E = [source: string, target: string, handle?: string];

function graph(nodes: N[], edges: E[]) {
  const result = parseUraGraph({
    nodes: [{ id: "s", type: "start" }, ...nodes].map((n) => ({ position: { x: 0, y: 0 }, data: {}, ...n })),
    edges: edges.map(([source, target, handle = "default"], i) => ({ id: `e${i}`, source, target, sourceHandle: handle })),
  });
  if (!result.ok) throw new Error(result.error);
  return result.graph;
}

function makeDeps() {
  return {
    listServices: vi.fn().mockResolvedValue([
      { id: SERVICE_ID, name: "Massagem relaxante", priceCents: 12000, durationMinutes: 60 },
      { id: "64b7f0c2a1b2c3d4e5f60722", name: "Drenagem", priceCents: 9950, durationMinutes: 45 },
    ]),
    findSlots: vi.fn().mockResolvedValue([
      {
        startsAt: new Date("2026-09-29T12:00:00.000Z"),
        therapistId: USER_ID,
        therapistName: "Ana",
        roomId: "room-1",
        roomName: "Sala 1",
      },
      {
        startsAt: new Date("2026-10-03T17:30:00.000Z"),
        therapistId: "64b7f0c2a1b2c3d4e5f60723",
        therapistName: "Bia",
        roomId: "room-2",
        roomName: "Sala 2",
      },
    ]),
    createBooking: vi.fn().mockResolvedValue({ ok: true, bookingId: "booking-1" }),
  };
}

type Input = Parameters<typeof walkUra>[0];

function run(g: Input["graph"], overrides: Partial<Input> = {}, deps = makeDeps()) {
  return walkUra({ graph: g, position: null, reply: null, variables: {}, builtins, now: NOW, ...overrides }, deps);
}

const reply = (text: string, optionId: string | null = null) => ({ text, optionId });
const at = (nodeId: string, resume: "reply" | "timeout" | "wake" = "reply") => ({ nodeId, resume });

describe("walkUra: mensagens e fim do fluxo", () => {
  it("envia as mensagens em ordem, com variáveis, e termina quando não há próximo nó", async () => {
    const g = graph(
      [
        { id: "a", type: "sendMessage", data: { text: "{{saudacao_custom}}Olá, {{contato_primeiro_nome}}!" } },
        { id: "b", type: "sendMessage", data: { text: "Agora são {{hora_atual}}." } },
      ],
      [
        ["s", "a"],
        ["a", "b"],
      ],
    );

    const result = await run(g);

    expect(result).toEqual({
      outgoing: [
        { kind: "text", text: "Olá, Maria!" },
        { kind: "text", text: "Agora são 09:30." },
      ],
      variables: {},
      state: { status: "ended", reason: "completed" },
      trace: ["s", "a", "b"],
    });
  });

  it("variável da sessão tem prioridade sobre a embutida", async () => {
    const g = graph([{ id: "a", type: "sendMessage", data: { text: "Oi {{contato_nome}}" } }], [["s", "a"]]);
    const result = await run(g, { variables: { contato_nome: "Mari" } });
    expect(result.outgoing).toEqual([{ kind: "text", text: "Oi Mari" }]);
  });

  it("envia mídia com legenda resolvida, ou sem legenda quando ela fica vazia", async () => {
    const g = graph(
      [
        { id: "a", type: "sendMedia", data: { mediaType: "image", url: "https://cdn.agendi.com/tabela.png", caption: "Preços, {{contato_primeiro_nome}}" } },
        { id: "b", type: "sendMedia", data: { mediaType: "document", url: "https://cdn.agendi.com/menu.pdf", caption: " " } },
      ],
      [
        ["s", "a"],
        ["a", "b"],
      ],
    );

    const result = await run(g);

    expect(result.outgoing).toEqual([
      { kind: "media", mediaType: "image", url: "https://cdn.agendi.com/tabela.png", caption: "Preços, Maria" },
      { kind: "media", mediaType: "document", url: "https://cdn.agendi.com/menu.pdf", caption: null },
    ]);
  });

  it("encerrar conversa envia a mensagem de despedida e termina como closed", async () => {
    const g = graph([{ id: "c", type: "closeConversation", data: { message: "Até logo, {{contato_primeiro_nome}}!" } }], [["s", "c"]]);
    const result = await run(g);
    expect(result.outgoing).toEqual([{ kind: "text", text: "Até logo, Maria!" }]);
    expect(result.state).toEqual({ status: "ended", reason: "closed" });
  });

  it("encerrar sem mensagem não envia nada", async () => {
    const g = graph([{ id: "c", type: "closeConversation" }], [["s", "c"]]);
    expect((await run(g)).outgoing).toEqual([]);
  });

  it("transferir para atendente termina como handoff com a pessoa escolhida, ou sem ninguém", async () => {
    const withUser = graph([{ id: "h", type: "handoff", data: { userId: USER_ID, message: "Já te passo para a recepção." } }], [["s", "h"]]);
    const result = await run(withUser);
    expect(result.outgoing).toEqual([{ kind: "text", text: "Já te passo para a recepção." }]);
    expect(result.state).toEqual({ status: "ended", reason: "handoff", assignUserId: USER_ID });

    const withoutUser = graph([{ id: "h", type: "handoff" }], [["s", "h"]]);
    expect((await run(withoutUser)).state).toEqual({ status: "ended", reason: "handoff", assignUserId: null });
  });

  it("para com reason limit depois de 50 nós, para laços de Ir para não travarem", async () => {
    const g = graph(
      [
        { id: "a", type: "setVariable", data: { variable: "x", value: "1" } },
        { id: "go", type: "goTo", data: { targetNodeId: "a" } },
      ],
      [
        ["s", "a"],
        ["a", "go"],
      ],
    );

    const result = await run(g);

    expect(result.state).toEqual({ status: "ended", reason: "limit" });
    expect(result.trace).toHaveLength(50);
  });

  it("Ir para um nó que não existe termina o fluxo", async () => {
    const g = graph([{ id: "go", type: "goTo", data: { targetNodeId: "sumiu" } }], [["s", "go"]]);
    expect((await run(g)).state).toEqual({ status: "ended", reason: "completed" });
  });
});

describe("walkUra: variáveis e condições", () => {
  it("define variável com template e desvia pela condição", async () => {
    const g = graph(
      [
        { id: "v", type: "setVariable", data: { variable: "periodo", value: "{{hora_atual}}" } },
        { id: "c", type: "condition", data: { variable: "periodo", operator: "less", value: "12:00" } },
        { id: "manha", type: "sendMessage", data: { text: "Manhã" } },
        { id: "tarde", type: "sendMessage", data: { text: "Tarde" } },
      ],
      [
        ["s", "v"],
        ["v", "c"],
        ["c", "manha", "true"],
        ["c", "tarde", "false"],
      ],
    );

    const result = await run(g);

    expect(result.variables).toEqual({ periodo: "09:30" });
    expect(result.outgoing).toEqual([{ kind: "text", text: "Manhã" }]);

    const afternoon = await run(g, { builtins: { ...builtins, hora_atual: "15:00" } });
    expect(afternoon.outgoing).toEqual([{ kind: "text", text: "Tarde" }]);
  });

  it("resolve o valor da condição como template", async () => {
    const g = graph(
      [
        { id: "c", type: "condition", data: { variable: "nome", operator: "equals", value: "{{contato_nome}}" } },
        { id: "sim", type: "sendMessage", data: { text: "igual" } },
      ],
      [
        ["s", "c"],
        ["c", "sim", "true"],
      ],
    );
    expect((await run(g, { variables: { nome: "maria clara" } })).outgoing).toEqual([{ kind: "text", text: "igual" }]);
  });
});

describe("walkUra: aguardar resposta", () => {
  const ask = (data: Record<string, unknown> = {}) =>
    graph(
      [
        { id: "w", type: "waitForReply", data: { message: "Qual seu e-mail?", variable: "email", ...data } },
        { id: "ok", type: "sendMessage", data: { text: "Anotado: {{email}}" } },
        { id: "ruim", type: "sendMessage", data: { text: "Vou pedir para a recepção te chamar." } },
      ],
      [
        ["s", "w"],
        ["w", "ok"],
        ["w", "ruim", "invalid"],
      ],
    );

  it("envia a pergunta e espera, sem prazo quando não há timeout", async () => {
    const result = await run(ask());
    expect(result.outgoing).toEqual([{ kind: "text", text: "Qual seu e-mail?" }]);
    expect(result.state).toEqual({ status: "waiting", nodeId: "w", timeoutAt: null });
  });

  it("com timeout, espera até o prazo", async () => {
    const result = await run(ask({ timeoutMinutes: 30 }));
    expect(result.state).toEqual({ status: "waiting", nodeId: "w", timeoutAt: new Date(NOW.getTime() + 30 * MINUTE) });
  });

  it("na resposta válida guarda a variável e a última resposta e segue pela saída padrão", async () => {
    const result = await run(ask({ validation: "email" }), { position: at("w"), reply: reply(" ana@spa.com ") });

    expect(result.variables).toEqual({ email: "ana@spa.com", ultima_resposta: "ana@spa.com" });
    expect(result.outgoing).toEqual([{ kind: "text", text: "Anotado: ana@spa.com" }]);
    expect(result.state).toEqual({ status: "ended", reason: "completed" });
    expect(result.trace).toEqual(["w", "ok"]);
  });

  it("a resposta é usada uma vez só: o próximo nó de espera faz a própria pergunta", async () => {
    const g = graph(
      [
        { id: "w1", type: "waitForReply", data: { message: "Nome?", variable: "nome" } },
        { id: "w2", type: "waitForReply", data: { message: "Quarto?", variable: "quarto" } },
      ],
      [
        ["s", "w1"],
        ["w1", "w2"],
      ],
    );

    const result = await run(g, { position: at("w1"), reply: reply("Ana") });

    expect(result.variables).toEqual({ nome: "Ana", ultima_resposta: "Ana" });
    expect(result.outgoing).toEqual([{ kind: "text", text: "Quarto?" }]);
    expect(result.state).toEqual({ status: "waiting", nodeId: "w2", timeoutAt: null });
  });

  it("na resposta inválida manda o aviso e espera de novo, contando a tentativa", async () => {
    const result = await run(ask({ validation: "email", errorMessage: "E-mail inválido, tente de novo." }), {
      position: at("w"),
      reply: reply("não tenho"),
    });

    expect(result.outgoing).toEqual([{ kind: "text", text: "E-mail inválido, tente de novo." }]);
    expect(result.state).toEqual({ status: "waiting", nodeId: "w", timeoutAt: null });
    expect(result.variables).toMatchObject({ ultima_resposta: "não tenho" });
    expect(result.variables).not.toHaveProperty("email");
  });

  it("sem aviso configurado usa um aviso padrão", async () => {
    const result = await run(ask({ validation: "email" }), { position: at("w"), reply: reply("x") });
    expect(result.outgoing).toEqual([{ kind: "text", text: "Resposta inválida. Tente novamente." }]);
  });

  it("depois de esgotar as tentativas segue pela saída inválida e zera o contador", async () => {
    const g = ask({ validation: "email", maxRetries: 1 });
    const first = await run(g, { position: at("w"), reply: reply("x") });
    expect(first.state).toMatchObject({ status: "waiting", nodeId: "w" });

    const second = await run(g, { position: at("w"), reply: reply("y"), variables: first.variables });

    expect(second.outgoing).toEqual([{ kind: "text", text: "Vou pedir para a recepção te chamar." }]);
    expect(second.state).toEqual({ status: "ended", reason: "completed" });
    expect(Object.keys(second.variables).filter((k) => k.startsWith("_"))).toEqual([]);
  });

  it("com zero tentativas vai direto para a saída inválida; sem saída inválida o fluxo termina", async () => {
    const g = graph(
      [{ id: "w", type: "waitForReply", data: { validation: "number", maxRetries: 0 } }],
      [["s", "w"]],
    );
    const result = await run(g, { position: at("w"), reply: reply("abc") });
    expect(result.outgoing).toEqual([]);
    expect(result.state).toEqual({ status: "ended", reason: "completed" });
  });

  it("no fim do prazo segue pela saída timeout, ou termina se ela não estiver ligada", async () => {
    const g = graph(
      [
        { id: "w", type: "waitForReply", data: { timeoutMinutes: 10 } },
        { id: "t", type: "sendMessage", data: { text: "Ainda está aí?" } },
      ],
      [
        ["s", "w"],
        ["w", "t", "timeout"],
      ],
    );
    const result = await run(g, { position: at("w", "timeout") });
    expect(result.outgoing).toEqual([{ kind: "text", text: "Ainda está aí?" }]);
    expect(result.state).toEqual({ status: "ended", reason: "completed" });

    const unwired = graph([{ id: "w", type: "waitForReply", data: { timeoutMinutes: 10 } }], [["s", "w"]]);
    expect((await run(unwired, { position: at("w", "timeout") })).state).toEqual({ status: "ended", reason: "completed" });
  });
});

describe("walkUra: menu", () => {
  const menu = (data: Record<string, unknown> = {}) =>
    graph(
      [
        {
          id: "m",
          type: "menu",
          data: {
            message: "{{contato_primeiro_nome}}, como posso ajudar?",
            buttonLabel: "Opções",
            options: [{ label: "Agendar" }, { label: "Preços" }],
            variable: "escolha",
            retryMessage: "Não entendi.",
            ...data,
          },
        },
        { id: "agendar", type: "sendMessage", data: { text: "Vamos agendar ({{escolha}})" } },
        { id: "precos", type: "sendMessage", data: { text: "Tabela de preços" } },
        { id: "ruim", type: "handoff" },
      ],
      [
        ["s", "m"],
        ["m", "agendar", "option_0"],
        ["m", "precos", "option_1"],
        ["m", "ruim", "invalid"],
      ],
    );

  it("envia o menu com uma opção por item e espera", async () => {
    const result = await run(menu());

    expect(result.outgoing).toEqual([
      {
        kind: "menu",
        text: "Maria, como posso ajudar?",
        buttonLabel: "Opções",
        options: [
          { id: "opt_0", title: "Agendar", description: null },
          { id: "opt_1", title: "Preços", description: null },
        ],
      },
    ]);
    expect(result.state).toEqual({ status: "waiting", nodeId: "m", timeoutAt: null });
  });

  it("segue pela saída da opção tocada e guarda o rótulo na variável", async () => {
    const result = await run(menu(), { position: at("m"), reply: reply("Agendar", "opt_0") });
    expect(result.outgoing).toEqual([{ kind: "text", text: "Vamos agendar (Agendar)" }]);
    expect(result.variables).toEqual({ escolha: "Agendar", ultima_resposta: "Agendar" });
  });

  it("aceita o número digitado", async () => {
    const result = await run(menu(), { position: at("m"), reply: reply("2") });
    expect(result.outgoing).toEqual([{ kind: "text", text: "Tabela de preços" }]);
  });

  it("sem combinar, manda o aviso e reenvia o menu", async () => {
    const result = await run(menu(), { position: at("m"), reply: reply("hein?") });

    expect(result.outgoing).toEqual([
      { kind: "text", text: "Não entendi." },
      expect.objectContaining({ kind: "menu", text: "Maria, como posso ajudar?" }),
    ]);
    expect(result.state).toEqual({ status: "waiting", nodeId: "m", timeoutAt: null });
  });

  it("depois das tentativas segue pela saída inválida", async () => {
    const result = await run(menu({ maxRetries: 0 }), { position: at("m"), reply: reply("hein?") });
    expect(result.state).toEqual({ status: "ended", reason: "handoff", assignUserId: null });
  });
});

describe("walkUra: pausa", () => {
  const g = graph(
    [
      { id: "a", type: "sendMessage", data: { text: "Um instante..." } },
      { id: "d", type: "delay", data: { seconds: 90 } },
      { id: "b", type: "sendMessage", data: { text: "Pronto!" } },
    ],
    [
      ["s", "a"],
      ["a", "d"],
      ["d", "b"],
    ],
  );

  it("envia o que veio antes e dorme até o prazo, apontando para o nó seguinte", async () => {
    const result = await run(g);
    expect(result.outgoing).toEqual([{ kind: "text", text: "Um instante..." }]);
    expect(result.state).toEqual({ status: "sleeping", nodeId: "b", wakeAt: new Date(NOW.getTime() + 90 * 1000) });
  });

  it("ao acordar continua do nó seguinte", async () => {
    const result = await run(g, { position: at("b", "wake") });
    expect(result.outgoing).toEqual([{ kind: "text", text: "Pronto!" }]);
    expect(result.trace).toEqual(["b"]);
  });

  it("pausa sem próximo nó termina sem dormir", async () => {
    const lone = graph([{ id: "d", type: "delay" }], [["s", "d"]]);
    expect((await run(lone)).state).toEqual({ status: "ended", reason: "completed" });
  });
});

describe("walkUra: agendamento", () => {
  const flow = graph(
    [
      { id: "svc", type: "chooseService", data: { unitId: UNIT_ID, message: "Qual serviço?", buttonLabel: "Serviços" } },
      { id: "slot", type: "chooseSlot", data: { message: "Escolha o horário de {{servico_nome}}", buttonLabel: "Horários", daysAhead: 5 } },
      { id: "book", type: "createBooking", data: { guestName: "{{contato_nome}}", guestRoom: "{{quarto}}" } },
      { id: "ok", type: "sendMessage", data: { text: "Agendado: {{servico_nome}} em {{horario_texto}} com {{terapeuta_nome}}." } },
      { id: "vazio", type: "sendMessage", data: { text: "Sem opções no momento." } },
      { id: "erro", type: "sendMessage", data: { text: "Esse horário acabou de ser ocupado." } },
    ],
    [
      ["s", "svc"],
      ["svc", "slot"],
      ["svc", "vazio", "empty"],
      ["slot", "book"],
      ["slot", "vazio", "empty"],
      ["book", "ok"],
      ["book", "erro", "error"],
    ],
  );

  it("lista os serviços da unidade com preço e duração", async () => {
    const deps = makeDeps();
    const result = await run(flow, {}, deps);

    expect(deps.listServices).toHaveBeenCalledWith(UNIT_ID);
    expect(result.outgoing).toEqual([
      {
        kind: "menu",
        text: "Qual serviço?",
        buttonLabel: "Serviços",
        options: [
          { id: `svc_${SERVICE_ID}`, title: "Massagem relaxante", description: "R$ 120,00 · 60 min" },
          { id: "svc_64b7f0c2a1b2c3d4e5f60722", title: "Drenagem", description: "R$ 99,50 · 45 min" },
        ],
      },
    ]);
    expect(result.state).toEqual({ status: "waiting", nodeId: "svc", timeoutAt: null });
  });

  it("sem serviços segue pela saída sem opções", async () => {
    const deps = makeDeps();
    deps.listServices.mockResolvedValue([]);
    const result = await run(flow, {}, deps);
    expect(result.outgoing).toEqual([{ kind: "text", text: "Sem opções no momento." }]);
  });

  it("ao escolher o serviço guarda os dados dele e oferece os horários livres", async () => {
    const deps = makeDeps();
    const first = await run(flow, {}, deps);

    const result = await run(flow, { position: at("svc"), reply: reply("1"), variables: first.variables }, deps);

    expect(deps.listServices).toHaveBeenCalledTimes(1);
    expect(result.variables).toMatchObject({
      unidade_id: UNIT_ID,
      servico_id: SERVICE_ID,
      servico_nome: "Massagem relaxante",
      servico_preco: "R$ 120,00",
      servico_duracao: "60",
    });
    expect(deps.findSlots).toHaveBeenCalledWith({ unitId: UNIT_ID, serviceId: SERVICE_ID, durationMinutes: 60, from: NOW, days: 5 });
    expect(result.outgoing).toEqual([
      {
        kind: "menu",
        text: "Escolha o horário de Massagem relaxante",
        buttonLabel: "Horários",
        options: [
          { id: "slot_0", title: "ter 29/09 09:00", description: "com Ana" },
          { id: "slot_1", title: "sáb 03/10 14:30", description: "com Bia" },
        ],
      },
    ]);
    expect(result.state).toEqual({ status: "waiting", nodeId: "slot", timeoutAt: null });
  });

  it("sem serviço escolhido o nó de horários segue pela saída sem opções", async () => {
    const deps = makeDeps();
    const result = await run(flow, { position: at("slot", "wake") }, deps);
    expect(deps.findSlots).not.toHaveBeenCalled();
    expect(result.outgoing).toEqual([{ kind: "text", text: "Sem opções no momento." }]);
  });

  it("ao escolher o horário cria o agendamento e segue pela saída padrão", async () => {
    const deps = makeDeps();
    const step1 = await run(flow, {}, deps);
    const step2 = await run(flow, { position: at("svc"), reply: reply("1"), variables: step1.variables }, deps);

    const result = await run(
      flow,
      { position: at("slot"), reply: reply("sáb 03/10 14:30", "slot_1"), variables: { ...step2.variables, quarto: "204" } },
      deps,
    );

    expect(deps.createBooking).toHaveBeenCalledWith({
      unitId: UNIT_ID,
      serviceId: SERVICE_ID,
      therapistId: "64b7f0c2a1b2c3d4e5f60723",
      roomId: "room-2",
      startsAt: new Date("2026-10-03T17:30:00.000Z"),
      guestName: "Maria Clara",
      guestRoom: "204",
    });
    expect(result.variables).toMatchObject({
      horario_inicio: "2026-10-03T17:30:00.000Z",
      horario_texto: "03/10 às 14:30",
      terapeuta_id: "64b7f0c2a1b2c3d4e5f60723",
      terapeuta_nome: "Bia",
      agendamento_id: "booking-1",
    });
    expect(result.outgoing).toEqual([{ kind: "text", text: "Agendado: Massagem relaxante em 03/10 às 14:30 com Bia." }]);
    expect(result.state).toEqual({ status: "ended", reason: "completed" });
  });

  it("quando o agendamento é recusado segue pela saída de erro", async () => {
    const deps = makeDeps();
    deps.createBooking.mockResolvedValue({ ok: false });
    const step1 = await run(flow, {}, deps);
    const step2 = await run(flow, { position: at("svc"), reply: reply("1"), variables: step1.variables }, deps);

    const result = await run(flow, { position: at("slot"), reply: reply("1"), variables: step2.variables }, deps);

    expect(result.outgoing).toEqual([{ kind: "text", text: "Esse horário acabou de ser ocupado." }]);
    expect(result.variables).not.toHaveProperty("agendamento_id");
  });

  it("criar agendamento sem horário escolhido segue pela saída de erro sem chamar o cadastro", async () => {
    const deps = makeDeps();
    const result = await run(flow, { position: at("book", "wake") }, deps);
    expect(deps.createBooking).not.toHaveBeenCalled();
    expect(result.outgoing).toEqual([{ kind: "text", text: "Esse horário acabou de ser ocupado." }]);
  });
});

// Serviço sem profissional (ex.: hidromassagem): o horário traz só o espaço.
describe("walkUra: agendamento de serviço sem profissional", () => {
  const flow = graph(
    [
      { id: "slot", type: "chooseSlot", data: { message: "Escolha o horário", buttonLabel: "Horários", daysAhead: 5 } },
      { id: "book", type: "createBooking", data: { guestName: "{{contato_nome}}", guestRoom: "{{quarto}}" } },
      { id: "ok", type: "sendMessage", data: { text: "Agendado em {{horario_texto}}." } },
      { id: "erro", type: "sendMessage", data: { text: "Erro." } },
    ],
    [
      ["s", "slot"],
      ["slot", "book"],
      ["book", "ok"],
      ["book", "erro", "error"],
    ],
  );
  const variables = { unidade_id: UNIT_ID, servico_id: SERVICE_ID, servico_duracao: "30", quarto: "204" };

  function makeHydroDeps() {
    const deps = makeDeps();
    deps.findSlots.mockResolvedValue([
      { startsAt: new Date("2026-09-29T12:00:00.000Z"), therapistId: null, therapistName: null, roomId: "tub", roomName: "Banheira" },
    ]);
    return deps;
  }

  it("oferece o horário com o nome do espaço e deixa o profissional vazio", async () => {
    const deps = makeHydroDeps();

    const result = await run(flow, { position: at("slot", "wake"), variables }, deps);

    expect(result.outgoing).toEqual([
      {
        kind: "menu",
        text: "Escolha o horário",
        buttonLabel: "Horários",
        options: [{ id: "slot_0", title: "ter 29/09 09:00", description: "em Banheira" }],
      },
    ]);
  });

  it("cria o agendamento sem profissional", async () => {
    const deps = makeHydroDeps();
    const offered = await run(flow, { position: at("slot", "wake"), variables }, deps);

    const result = await run(flow, { position: at("slot"), reply: reply("1"), variables: offered.variables }, deps);

    expect(result.variables).toMatchObject({ terapeuta_id: "", terapeuta_nome: "", sala_id: "tub" });
    expect(deps.createBooking).toHaveBeenCalledWith({
      unitId: UNIT_ID,
      serviceId: SERVICE_ID,
      therapistId: null,
      roomId: "tub",
      startsAt: new Date("2026-09-29T12:00:00.000Z"),
      guestName: "Maria Clara",
      guestRoom: "204",
    });
    expect(result.outgoing).toEqual([{ kind: "text", text: "Agendado em 29/09 às 09:00." }]);
  });
});

