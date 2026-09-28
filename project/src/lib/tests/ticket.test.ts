import { describe, it, expect, vi } from "vitest";
import { createTicket } from "@/lib/ticket";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const USER_ID = "64b7f0c2a1b2c3d4e5f60720";
const TICKET_ID = "64b7f0c2a1b2c3d4e5f60799";

const validInput = {
  type: "bug",
  title: "Calendário não carrega",
  description: "Ao abrir o calendário da unidade a tela fica em branco.",
};

describe("createTicket", () => {
  const ctx = { workspaceId: WORKSPACE_ID, userId: USER_ID, actorRole: "massage_therapist" } as const;
  const makeInsert = () => vi.fn().mockResolvedValue({ id: TICKET_ID });

  it("registra o ticket do usuário no workspace e retorna o id", async () => {
    const insert = makeInsert();

    const result = await createTicket(validInput, ctx, insert);

    expect(result).toEqual({ ok: true, ticketId: TICKET_ID });
    expect(insert).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      type: "bug",
      title: "Calendário não carrega",
      description: "Ao abrir o calendário da unidade a tela fica em branco.",
    });
  });

  it("aceita sugestão de melhoria", async () => {
    const insert = makeInsert();

    await createTicket({ ...validInput, type: "improvement" }, ctx, insert);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ type: "improvement" }));
  });

  it("tira espaços das pontas do título e da descrição", async () => {
    const insert = makeInsert();

    await createTicket({ ...validInput, title: "  Título  ", description: "\n Texto \n" }, ctx, insert);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ title: "Título", description: "Texto" }));
  });

  it.each(["owner", "admin", "receptionist", "massage_therapist"] as const)("qualquer função abre ticket (%s)", async (role) => {
    const result = await createTicket(validInput, { ...ctx, actorRole: role }, makeInsert());

    expect(result.ok).toBe(true);
  });

  it("sem acesso ao workspace → workspace_not_found", async () => {
    const insert = makeInsert();

    const result = await createTicket(validInput, { ...ctx, actorRole: null }, insert);

    expect(result).toEqual({ ok: false, error: "workspace_not_found" });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([null, undefined, "texto", { ...validInput, title: 1 }, { ...validInput, description: null }])(
    "entrada malformada → invalid_input (%j)",
    async (input) => {
      const insert = makeInsert();

      const result = await createTicket(input, ctx, insert);

      expect(result).toEqual({ ok: false, error: "invalid_input" });
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it.each(["", "question", undefined])("tipo fora de bug/melhoria → invalid_type (%j)", async (type) => {
    const result = await createTicket({ ...validInput, type }, ctx, makeInsert());

    expect(result).toEqual({ ok: false, error: "invalid_type" });
  });

  it("título vazio (só espaços) → invalid_title", async () => {
    const result = await createTicket({ ...validInput, title: "   " }, ctx, makeInsert());

    expect(result).toEqual({ ok: false, error: "invalid_title" });
  });

  it("título com 120 caracteres passa; com 121 → title_too_long", async () => {
    expect((await createTicket({ ...validInput, title: "a".repeat(120) }, ctx, makeInsert())).ok).toBe(true);

    const result = await createTicket({ ...validInput, title: "a".repeat(121) }, ctx, makeInsert());

    expect(result).toEqual({ ok: false, error: "title_too_long" });
  });

  it("descrição vazia (só espaços) → invalid_description", async () => {
    const result = await createTicket({ ...validInput, description: " \n " }, ctx, makeInsert());

    expect(result).toEqual({ ok: false, error: "invalid_description" });
  });

  it("descrição com 5000 caracteres passa; com 5001 → description_too_long", async () => {
    expect((await createTicket({ ...validInput, description: "a".repeat(5000) }, ctx, makeInsert())).ok).toBe(true);

    const result = await createTicket({ ...validInput, description: "a".repeat(5001) }, ctx, makeInsert());

    expect(result).toEqual({ ok: false, error: "description_too_long" });
  });
});
