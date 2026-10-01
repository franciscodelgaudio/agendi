// Sem dependências de servidor: também é importado pelo painel da AgenIA.
// Ações que a AgenIA pode propor e que só rodam depois da autorização do usuário. A entrada
// é validada aqui e convertida nos campos do FormData que as server actions já esperam.
import { z } from "zod";
import { TICKET_TYPES } from "@/lib/ticket";

const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "id inválido");
const ids = z.array(objectId);
// "admin" ou o id de uma role do workspace; a existência da role é checada ao executar.
const memberRole = z.union([z.literal("admin"), objectId]);
// Reais com até duas casas: 150.5 vira "150.50".
const money = z
  .number()
  .nonnegative()
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "no máximo duas casas decimais");
const minutes = z.number().int().positive();
const dateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "use AAAA-MM-DDTHH:mm")
  .describe("Data e hora no horário de Brasília, AAAA-MM-DDTHH:mm.");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD").describe("Dia, AAAA-MM-DD.");
const summary = z
  .string()
  .min(1)
  .max(300)
  .describe("O que vai acontecer, em uma frase com nomes (não ids), para o usuário ler no card de autorização.");

const productFields = {
  name: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  cost: money.describe("Custo unitário em reais."),
  notes: z.string().nullable(),
  rating: z.number().int().min(1).max(5).nullable().describe("Avaliação de 1 a 5 estrelas."),
  avatarUrl: z.string().nullable(),
};

const serviceFields = {
  name: z.string().min(1),
  price: money.describe("Preço em reais."),
  durationMinutes: minutes,
};

const conversation = z.object({ conversationId: objectId, summary });

type ActionSpec = { label: string; description: string; input: z.ZodObject };

const spec = <S extends z.ZodRawShape>(label: string, description: string, shape: S) => ({
  label,
  description,
  input: z.object(shape),
});

export const AGENIA_ACTIONS = {
  createService: spec("Criar serviço", "Cria um serviço no catálogo de uma unidade.", {
    unitId: objectId,
    ...serviceFields,
    productIds: ids.default([]).describe("Produtos que o serviço costuma usar."),
    summary,
  }),
  updateService: spec("Editar serviço", "Edita um serviço. Informe só os campos que mudam.", {
    unitId: objectId,
    serviceId: objectId,
    name: serviceFields.name.optional(),
    price: serviceFields.price.optional(),
    durationMinutes: minutes.optional(),
    productIds: ids.optional(),
    summary,
  }),
  deleteService: spec("Excluir serviço", "Exclui um serviço de uma unidade.", { unitId: objectId, serviceId: objectId, summary }),
  createProduct: spec("Cadastrar produto", "Cadastra um produto no estoque de uma unidade.", {
    unitId: objectId,
    name: productFields.name,
    quantity: productFields.quantity,
    cost: productFields.cost,
    notes: productFields.notes.optional(),
    rating: productFields.rating.optional(),
    avatarUrl: productFields.avatarUrl.optional(),
    summary,
  }),
  updateProduct: spec(
    "Editar produto",
    "Edita os dados de um produto do catálogo (nome, custo, observações, avaliação, imagem). A quantidade não muda por aqui. Informe só os campos que mudam.",
    {
      unitId: objectId,
      productId: objectId,
      name: productFields.name.optional(),
      cost: productFields.cost.optional(),
      notes: productFields.notes.optional(),
      rating: productFields.rating.optional(),
      avatarUrl: productFields.avatarUrl.optional(),
      summary,
    },
  ),
  deleteProduct: spec("Excluir produto", "Exclui um produto do estoque.", { unitId: objectId, productId: objectId, summary }),
  createBooking: spec("Criar agendamento", "Marca um horário na agenda de uma unidade.", {
    unitId: objectId,
    therapistId: objectId.describe("userId do profissional."),
    serviceId: objectId,
    treatmentRoomId: objectId.describe("Sala de atendimento da unidade."),
    guestName: z.string().min(1),
    room: z.string().min(1).describe("Quarto ou identificação do hóspede/cliente."),
    startsAt: dateTime,
    durationMinutes: minutes,
    productIds: ids.default([]),
    color: z.string().nullable().optional(),
    summary,
  }),
  rescheduleBooking: spec("Remarcar agendamento", "Muda o início e o fim de um agendamento.", {
    bookingId: objectId,
    startsAt: dateTime,
    endsAt: dateTime,
    summary,
  }),
  deleteBooking: spec("Excluir agendamento", "Exclui um agendamento da agenda.", { bookingId: objectId, summary }),
  createAppointment: spec("Registrar atendimento", "Registra um atendimento realizado numa unidade (entra no caixa).", {
    unitId: objectId,
    guestName: z.string().min(1),
    room: z.string().min(1),
    performedAt: dateTime,
    serviceIds: ids.min(1),
    therapistIds: ids.min(1).describe("userIds dos profissionais."),
    productIds: ids.default([]),
    summary,
  }),
  deleteAppointment: spec("Excluir atendimento", "Exclui um atendimento registrado.", {
    unitId: objectId,
    appointmentId: objectId,
    summary,
  }),
  createExpense: spec("Lançar despesa", "Lança uma despesa no caixa de uma unidade.", {
    unitId: objectId,
    groupId: objectId.describe("Grupo de despesa da unidade."),
    description: z.string().min(1).max(80),
    amount: money.positive().describe("Valor em reais; nas parcelas, o total."),
    date: day,
    paid: z.boolean(),
    repeat: z.enum(["installments", "recurring"]).optional().describe("installments: parcelado; recurring: todo mês."),
    count: z.number().int().min(2).max(60).optional().describe("Quantidade de meses quando repete."),
    summary,
  }),
  setExpensePaid: spec("Marcar despesa", "Marca uma despesa como paga ou em aberto.", {
    unitId: objectId,
    expenseId: objectId,
    paid: z.boolean(),
    summary,
  }),
  deleteExpense: spec("Excluir despesa", "Exclui uma despesa (ou ela e as próximas da série).", {
    unitId: objectId,
    expenseId: objectId,
    scope: z.enum(["this", "following"]).default("this"),
    summary,
  }),
  inviteMember: spec("Convidar membro", "Convida uma pessoa por e-mail para o workspace.", {
    email: z.email(),
    role: memberRole,
    summary,
  }),
  updateMember: spec("Editar membro", "Muda o nome e a função de um membro.", {
    memberId: objectId,
    name: z.string().min(1),
    role: memberRole,
    summary,
  }),
  removeMember: spec("Remover membro", "Remove um membro do workspace.", { memberId: objectId, summary }),
  setUraActive: spec("Ativar/desativar URA", "Ativa ou desativa uma URA.", { uraId: objectId, active: z.boolean(), summary }),
  deleteUra: spec("Excluir URA", "Exclui uma URA e encerra as sessões dela.", { uraId: objectId, summary }),
  sendReply: spec("Enviar mensagem", "Envia uma mensagem ao cliente numa conversa.", {
    conversationId: objectId,
    text: z.string().min(1).max(4096),
    summary,
  }),
  takeConversation: spec("Assumir conversa", "Passa a conversa para o usuário atual e para a URA.", conversation.shape),
  closeConversation: spec("Encerrar conversa", "Encerra a conversa.", conversation.shape),
  stopConversationUra: spec("Parar URA", "Para a URA em andamento na conversa; a conversa fica com a equipe.", conversation.shape),
  createTicket: spec("Abrir ticket", "Abre um ticket de suporte (bug ou melhoria) para a equipe do agendi.", {
    type: z.enum(TICKET_TYPES),
    title: z.string().min(1),
    description: z.string().min(1),
    summary,
  }),
} satisfies Record<string, ActionSpec>;

export type AgeniaActionName = keyof typeof AGENIA_ACTIONS;
export type AgeniaActionInput<N extends AgeniaActionName> = z.infer<(typeof AGENIA_ACTIONS)[N]["input"]>;

export const AGENIA_ACTION_NAMES = Object.keys(AGENIA_ACTIONS) as AgeniaActionName[];

export function isAgeniaAction(name: string): name is AgeniaActionName {
  return Object.hasOwn(AGENIA_ACTIONS, name);
}

export function parseAgeniaAction(
  name: string,
  input: unknown,
):
  | { ok: true; name: AgeniaActionName; input: Record<string, unknown> }
  | { ok: false; error: "unknown_action" | "invalid_input" } {
  if (!isAgeniaAction(name)) return { ok: false, error: "unknown_action" };
  const parsed = AGENIA_ACTIONS[name].input.safeParse(input);
  return parsed.success ? { ok: true, name, input: parsed.data } : { ok: false, error: "invalid_input" };
}

type Entries = [string, string][];

const cents = (value: unknown) => (value as number).toFixed(2);
const many = (key: string, values: unknown) => ((values as string[] | undefined) ?? []).map((v): [string, string] => [key, v]);
const optional = (value: unknown) => (value == null ? "" : String(value));

// Campos do FormData de cada ação; ações que recebem só ids por argumento não têm formulário.
export function actionFormEntries(name: AgeniaActionName, input: Record<string, unknown>): Entries {
  const i = input;
  switch (name) {
    case "createService":
    case "updateService":
      return [
        ["name", String(i.name)],
        ["price", cents(i.price)],
        ["durationMinutes", String(i.durationMinutes)],
        ...many("productId", i.productIds),
      ];
    case "createProduct":
      return [
        ["name", String(i.name)],
        ["quantity", String(i.quantity)],
        ["cost", cents(i.cost)],
        ["notes", optional(i.notes)],
        ["rating", optional(i.rating)],
        ["avatarUrl", optional(i.avatarUrl)],
      ];
    // A quantidade muda por compra ou ajuste, não na edição.
    case "updateProduct":
      return [
        ["name", String(i.name)],
        ["cost", cents(i.cost)],
        ["notes", optional(i.notes)],
        ["rating", optional(i.rating)],
        ["avatarUrl", optional(i.avatarUrl)],
      ];
    case "createBooking":
      return [
        ["unitId", String(i.unitId)],
        ["therapistId", String(i.therapistId)],
        ["serviceId", String(i.serviceId)],
        ["treatmentRoomId", String(i.treatmentRoomId)],
        ["guestName", String(i.guestName)],
        ["room", String(i.room)],
        ["startsAt", String(i.startsAt)],
        ["durationMinutes", String(i.durationMinutes)],
        ...many("productId", i.productIds),
        ["color", optional(i.color)],
      ];
    case "createAppointment":
      return [
        ["guestName", String(i.guestName)],
        ["room", String(i.room)],
        ["performedAt", String(i.performedAt)],
        ...many("serviceId", i.serviceIds),
        ...many("therapistId", i.therapistIds),
        ...many("productId", i.productIds),
      ];
    case "createExpense":
      return [
        ["groupId", String(i.groupId)],
        ["description", String(i.description)],
        ["amount", cents(i.amount)],
        ["date", String(i.date)],
        ...(i.paid ? [["paid", "on"] as [string, string]] : []),
        ["repeat", i.repeat ? String(i.repeat) : "none"],
        ...(i.repeat && i.count != null ? [["count", String(i.count)] as [string, string]] : []),
      ];
    case "inviteMember":
      return [
        ["email", String(i.email)],
        ["role", String(i.role)],
      ];
    case "updateMember":
      return [
        ["name", String(i.name)],
        ["role", String(i.role)],
      ];
    case "createTicket":
      return [
        ["type", String(i.type)],
        ["title", String(i.title)],
        ["description", String(i.description)],
      ];
    case "sendReply":
      return [["text", String(i.text)]];
    default:
      return [];
  }
}

// Edição parcial: campos undefined ficam com o valor atual; null limpa.
export function mergePatch<T extends object>(current: T, patch: { [K in keyof T]?: T[K] | null }): T {
  const merged = { ...current } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) if (value !== undefined) merged[key] = value;
  return merged as T;
}
