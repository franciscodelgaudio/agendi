import { describe, it, expect, vi } from "vitest";
import { createLead } from "@/lib/lead";

const validInput = {
  name: "Marina Souza",
  whatsapp: "(11) 98765-4321",
  message: "Tenho um salão com 2 unidades e 8 profissionais.",
};

describe("createLead", () => {
  const makeInsert = () => vi.fn().mockResolvedValue(undefined);

  it("salva o contato com o WhatsApp só com dígitos", async () => {
    const insert = makeInsert();

    const result = await createLead(validInput, insert);

    expect(result).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({
      name: "Marina Souza",
      whatsapp: "11987654321",
      message: "Tenho um salão com 2 unidades e 8 profissionais.",
    });
  });

  it("aceita número com código do país", async () => {
    const insert = makeInsert();

    await createLead({ ...validInput, whatsapp: "+55 11 98765-4321" }, insert);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ whatsapp: "5511987654321" }));
  });

  it("tira espaços das pontas do nome e da mensagem", async () => {
    const insert = makeInsert();

    await createLead({ ...validInput, name: "  Marina  ", message: "\n Oi \n" }, insert);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ name: "Marina", message: "Oi" }));
  });

  it.each([undefined, null, "", "   "])("mensagem vazia (%s) vira null", async (message) => {
    const insert = makeInsert();

    const result = await createLead({ ...validInput, message }, insert);

    expect(result).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ message: null }));
  });

  it("campo isca preenchido (robô) → ok sem salvar", async () => {
    const insert = makeInsert();

    const result = await createLead({ ...validInput, website: "http://spam.example" }, insert);

    expect(result).toEqual({ ok: true });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([null, "texto", 42])("input que não é objeto (%s) → invalid_input", async (input) => {
    const result = await createLead(input, makeInsert());

    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });

  it("nome ou WhatsApp que não são texto → invalid_input", async () => {
    expect(await createLead({ ...validInput, name: 1 }, makeInsert())).toEqual({ ok: false, error: "invalid_input" });
    expect(await createLead({ ...validInput, whatsapp: null }, makeInsert())).toEqual({ ok: false, error: "invalid_input" });
  });

  it("nome vazio → invalid_name", async () => {
    const insert = makeInsert();

    const result = await createLead({ ...validInput, name: "   " }, insert);

    expect(result).toEqual({ ok: false, error: "invalid_name" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("nome com mais de 120 caracteres → name_too_long", async () => {
    const result = await createLead({ ...validInput, name: "a".repeat(121) }, makeInsert());

    expect(result).toEqual({ ok: false, error: "name_too_long" });
  });

  it.each(["123456789", "12345678901234", "abc"])("WhatsApp com menos de 10 ou mais de 13 dígitos (%s) → invalid_whatsapp", async (whatsapp) => {
    const insert = makeInsert();

    const result = await createLead({ ...validInput, whatsapp }, insert);

    expect(result).toEqual({ ok: false, error: "invalid_whatsapp" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("mensagem com mais de 2000 caracteres → message_too_long", async () => {
    const result = await createLead({ ...validInput, message: "a".repeat(2001) }, makeInsert());

    expect(result).toEqual({ ok: false, error: "message_too_long" });
  });

  it("mensagem que não é texto → invalid_input", async () => {
    const result = await createLead({ ...validInput, message: 5 }, makeInsert());

    expect(result).toEqual({ ok: false, error: "invalid_input" });
  });
});
