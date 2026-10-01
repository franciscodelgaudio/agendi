import { describe, it, expect, vi } from "vitest";
import {
  addStockItem,
  createCatalogProduct,
  createProduct,
  adjustStock,
  deleteProduct,
  depleteProduct,
  registerPurchase,
  updateCatalogProduct,
} from "@/lib/product";

const UNIT_ID = "64b7f0c2a1b2c3d4e5f60720";
const PRODUCT_ID = "64b7f0c2a1b2c3d4e5f60740";

// Como chega do FormData: campos opcionais vazios chegam como "".
const validInput = {
  name: "Óleo de amêndoas",
  quantity: "12",
  cost: "45.9",
  notes: "",
  rating: "",
  avatarUrl: "",
};

const validData = {
  name: "Óleo de amêndoas",
  quantity: 12,
  costCents: 4590,
  notes: null,
  rating: null,
  avatarUrl: null,
};

describe("createProduct", () => {
  function makeInsert() {
    return vi.fn().mockResolvedValue({ id: PRODUCT_ID });
  }

  it("cria o produto na unidade com o custo em centavos e opcionais vazios como null", async () => {
    const insert = makeInsert();

    const result = await createProduct(validInput, UNIT_ID, insert);

    expect(result).toEqual({ ok: true, productId: PRODUCT_ID });
    expect(insert).toHaveBeenCalledWith({ ...validData, unitId: UNIT_ID });
  });

  it("salva observações, avaliação e avatarUrl quando informados, sem espaços nas pontas", async () => {
    const insert = makeInsert();

    await createProduct(
      {
        name: "  Óleo de amêndoas  ",
        quantity: " 12 ",
        cost: " 45.9 ",
        notes: "  Fornecedor X  ",
        rating: " 4 ",
        avatarUrl: "  https://cdn.example.com/oleo.png  ",
      },
      UNIT_ID,
      insert,
    );

    expect(insert).toHaveBeenCalledWith({
      ...validData,
      notes: "Fornecedor X",
      rating: 4,
      avatarUrl: "https://cdn.example.com/oleo.png",
      unitId: UNIT_ID,
    });
  });

  it("trata opcionais ausentes (null do FormData) e só com espaços como null", async () => {
    const insert = makeInsert();

    await createProduct(
      { name: "Óleo de amêndoas", quantity: "12", cost: "45.9", notes: "   ", rating: null, avatarUrl: null },
      UNIT_ID,
      insert,
    );

    expect(insert).toHaveBeenCalledWith({ ...validData, unitId: UNIT_ID });
  });

  it.each([
    ["45.9", 4590],
    ["45.90", 4590],
    ["0.1", 10],
    ["0", 0],
    ["1000000", 100000000],
  ])("converte o custo %j em %d centavos", async (cost, costCents) => {
    const insert = makeInsert();

    await createProduct({ ...validInput, cost }, UNIT_ID, insert);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ costCents }));
  });

  it.each([
    ["0", 0],
    ["1000000", 1000000],
  ])("aceita quantidade %s (limites)", async (quantity, expected) => {
    const insert = makeInsert();

    await createProduct({ ...validInput, quantity }, UNIT_ID, insert);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ quantity: expected }));
  });

  it.each(["1", "2", "3", "4", "5"])("aceita avaliação %s", async (rating) => {
    const insert = makeInsert();

    await createProduct({ ...validInput, rating }, UNIT_ID, insert);

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ rating: Number(rating) }));
  });

  it("aceita nome com 80 e observações com 500 caracteres", async () => {
    const result = await createProduct(
      { ...validInput, name: "a".repeat(80), notes: "a".repeat(500) },
      UNIT_ID,
      makeInsert(),
    );

    expect(result).toEqual({ ok: true, productId: PRODUCT_ID });
  });

  it.each([
    ["input nulo", null, "invalid_input"],
    ["nome ausente", { quantity: "12", cost: "45.9" }, "invalid_input"],
    ["quantidade ausente (null do FormData)", { ...validInput, quantity: null }, "invalid_input"],
    ["custo ausente (null do FormData)", { ...validInput, cost: null }, "invalid_input"],
    ["observações não são string", { ...validInput, notes: 123 }, "invalid_input"],
    ["avaliação não é string", { ...validInput, rating: 4 }, "invalid_input"],
    ["avatarUrl não é string", { ...validInput, avatarUrl: 123 }, "invalid_input"],
    ["nome vazio", { ...validInput, name: "" }, "invalid_name"],
    ["nome só com espaços", { ...validInput, name: "   " }, "invalid_name"],
    ["nome com mais de 80 caracteres", { ...validInput, name: "a".repeat(81) }, "name_too_long"],
    ["quantidade vazia", { ...validInput, quantity: "" }, "invalid_quantity"],
    ["quantidade negativa", { ...validInput, quantity: "-1" }, "invalid_quantity"],
    ["quantidade fracionada", { ...validInput, quantity: "1.5" }, "invalid_quantity"],
    ["quantidade não numérica", { ...validInput, quantity: "abc" }, "invalid_quantity"],
    ["quantidade acima de 1.000.000", { ...validInput, quantity: "1000001" }, "invalid_quantity"],
    ["custo vazio", { ...validInput, cost: "" }, "invalid_cost"],
    ["custo negativo", { ...validInput, cost: "-10" }, "invalid_cost"],
    ["custo com mais de 2 casas decimais", { ...validInput, cost: "45.999" }, "invalid_cost"],
    ["custo com vírgula", { ...validInput, cost: "45,90" }, "invalid_cost"],
    ["custo acima de 1.000.000,00", { ...validInput, cost: "1000000.01" }, "invalid_cost"],
    ["observações com mais de 500 caracteres", { ...validInput, notes: "a".repeat(501) }, "notes_too_long"],
    ["avaliação zero", { ...validInput, rating: "0" }, "invalid_rating"],
    ["avaliação acima de 5", { ...validInput, rating: "6" }, "invalid_rating"],
    ["avaliação fracionada", { ...validInput, rating: "4.5" }, "invalid_rating"],
    ["avaliação não numérica", { ...validInput, rating: "abc" }, "invalid_rating"],
  ])("retorna erro sem salvar quando %s", async (_label, input, error) => {
    const insert = makeInsert();

    const result = await createProduct(input, UNIT_ID, insert);

    expect(result).toEqual({ ok: false, error });
    expect(insert).not.toHaveBeenCalled();
  });

  it.each([undefined, null, ""])(
    "retorna unit_not_found sem salvar quando não há unitId (%j)",
    async (unitId) => {
      const insert = makeInsert();

      const result = await createProduct(validInput, unitId, insert);

      expect(result).toEqual({ ok: false, error: "unit_not_found" });
      expect(insert).not.toHaveBeenCalled();
    },
  );
});

describe("deleteProduct", () => {
  it("exclui o produto pelo id", async () => {
    const remove = vi.fn().mockResolvedValue(true);

    const result = await deleteProduct(PRODUCT_ID, remove);

    expect(result).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(PRODUCT_ID);
  });

  it.each([undefined, null, ""])(
    "retorna product_not_found sem excluir quando não há productId (%j)",
    async (productId) => {
      const remove = vi.fn().mockResolvedValue(true);

      const result = await deleteProduct(productId, remove);

      expect(result).toEqual({ ok: false, error: "product_not_found" });
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it("retorna product_not_found quando o produto não existe (ou não é da unidade)", async () => {
    const result = await deleteProduct(PRODUCT_ID, vi.fn().mockResolvedValue(false));

    expect(result).toEqual({ ok: false, error: "product_not_found" });
  });
});

describe("depleteProduct", () => {
  // deplete registra o "acabou" e tira 1 da quantidade numa só escrita.
  it("registra que o produto acabou", async () => {
    const deplete = vi.fn().mockResolvedValue("depleted");

    const result = await depleteProduct(PRODUCT_ID, deplete);

    expect(result).toEqual({ ok: true });
    expect(deplete).toHaveBeenCalledWith(PRODUCT_ID);
  });

  it("retorna out_of_stock quando a quantidade já é zero", async () => {
    const result = await depleteProduct(PRODUCT_ID, vi.fn().mockResolvedValue("out_of_stock"));

    expect(result).toEqual({ ok: false, error: "out_of_stock" });
  });

  it("retorna product_not_found quando o produto não existe (ou não é da unidade)", async () => {
    const result = await depleteProduct(PRODUCT_ID, vi.fn().mockResolvedValue("not_found"));

    expect(result).toEqual({ ok: false, error: "product_not_found" });
  });

  it.each([undefined, null, ""])(
    "retorna product_not_found sem registrar quando não há productId (%j)",
    async (productId) => {
      const deplete = vi.fn();

      const result = await depleteProduct(productId, deplete);

      expect(result).toEqual({ ok: false, error: "product_not_found" });
      expect(deplete).not.toHaveBeenCalled();
    },
  );
});

// Edição do produto no catálogo do workspace: os dados dele, sem a quantidade, que é de cada estoque.
describe("updateCatalogProduct", () => {
  const catalogInput = { name: validInput.name, cost: validInput.cost, notes: "", rating: "", avatarUrl: "" };
  const catalogData = { name: validData.name, costCents: validData.costCents, notes: null, rating: null, avatarUrl: null };

  it("atualiza o produto com os dados normalizados, sem quantidade", async () => {
    const update = vi.fn().mockResolvedValue(true);

    const result = await updateCatalogProduct({ ...catalogInput, name: "  Óleo de amêndoas  " }, PRODUCT_ID, update);

    expect(result).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(PRODUCT_ID, catalogData);
  });

  it("ignora a quantidade, se vier", async () => {
    const update = vi.fn().mockResolvedValue(true);

    await updateCatalogProduct({ ...catalogInput, quantity: "abc" }, PRODUCT_ID, update);

    expect(update).toHaveBeenCalledWith(PRODUCT_ID, catalogData);
  });

  it.each([
    ["nome vazio", { ...catalogInput, name: " " }, "invalid_name"],
    ["custo inválido", { ...catalogInput, cost: "x" }, "invalid_cost"],
    ["nome que não é texto", { ...catalogInput, name: 1 }, "invalid_input"],
  ])("recusa %s", async (_label, input, error) => {
    const update = vi.fn();

    expect(await updateCatalogProduct(input, PRODUCT_ID, update)).toEqual({ ok: false, error });
    expect(update).not.toHaveBeenCalled();
  });

  it("retorna product_not_found sem id ou quando o produto não existe (ou não é do workspace)", async () => {
    expect(await updateCatalogProduct(catalogInput, null, vi.fn())).toEqual({ ok: false, error: "product_not_found" });
    expect(await updateCatalogProduct(catalogInput, PRODUCT_ID, vi.fn().mockResolvedValue(false))).toEqual({
      ok: false,
      error: "product_not_found",
    });
  });
});

// Põe no estoque da unidade um produto que já está no catálogo, com a quantidade que ela tem.
describe("addStockItem", () => {
  const input = { productId: PRODUCT_ID, quantity: "5" };

  it("adiciona o produto com a quantidade", async () => {
    const add = vi.fn().mockResolvedValue("added");

    expect(await addStockItem(input, add)).toEqual({ ok: true });
    expect(add).toHaveBeenCalledWith(PRODUCT_ID, 5);
  });

  it("aceita quantidade zero e com espaços nas pontas", async () => {
    const add = vi.fn().mockResolvedValue("added");

    await addStockItem({ ...input, quantity: " 0 " }, add);

    expect(add).toHaveBeenCalledWith(PRODUCT_ID, 0);
  });

  it.each([
    ["entrada que não é objeto", null, "invalid_input"],
    ["produto que não é texto", { ...input, productId: 1 }, "invalid_input"],
    ["quantidade que não é texto", { ...input, quantity: 5 }, "invalid_input"],
    ["id de produto inválido", { ...input, productId: "x" }, "product_not_found"],
    ["quantidade negativa", { ...input, quantity: "-1" }, "invalid_quantity"],
    ["quantidade fracionada", { ...input, quantity: "1.5" }, "invalid_quantity"],
    ["quantidade acima de 1.000.000", { ...input, quantity: "1000001" }, "invalid_quantity"],
  ])("recusa %s", async (_label, addInput, error) => {
    const add = vi.fn();

    expect(await addStockItem(addInput, add)).toEqual({ ok: false, error });
    expect(add).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", "product_not_found"],
    ["already_in_stock", "already_in_stock"],
  ])("repassa o resultado %s da escrita", async (outcome, error) => {
    expect(await addStockItem(input, vi.fn().mockResolvedValue(outcome))).toEqual({ ok: false, error });
  });
});

// Cadastro direto no catálogo do workspace (aba Produtos), sem pôr em nenhum estoque.
describe("createCatalogProduct", () => {
  const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
  const input = { name: "  Óleo de amêndoas  ", cost: "45.9", notes: "", rating: "", avatarUrl: "" };
  const data = { name: "Óleo de amêndoas", costCents: 4590, notes: null, rating: null, avatarUrl: null };

  it("cria o produto no workspace com os dados normalizados, sem quantidade", async () => {
    const insert = vi.fn().mockResolvedValue({ id: PRODUCT_ID });

    expect(await createCatalogProduct(input, WORKSPACE_ID, insert)).toEqual({ ok: true, productId: PRODUCT_ID });
    expect(insert).toHaveBeenCalledWith({ ...data, workspaceId: WORKSPACE_ID });
  });

  it("ignora a quantidade, se vier", async () => {
    const insert = vi.fn().mockResolvedValue({ id: PRODUCT_ID });

    await createCatalogProduct({ ...input, quantity: "abc" }, WORKSPACE_ID, insert);

    expect(insert).toHaveBeenCalledWith({ ...data, workspaceId: WORKSPACE_ID });
  });

  it.each([
    ["nome vazio", { ...input, name: " " }, "invalid_name"],
    ["custo inválido", { ...input, cost: "x" }, "invalid_cost"],
    ["avaliação inválida", { ...input, rating: "6" }, "invalid_rating"],
    ["nome que não é texto", { ...input, name: 1 }, "invalid_input"],
  ])("recusa %s", async (_label, productInput, error) => {
    const insert = vi.fn();

    expect(await createCatalogProduct(productInput, WORKSPACE_ID, insert)).toEqual({ ok: false, error });
    expect(insert).not.toHaveBeenCalled();
  });

  it("sem workspace, não grava", async () => {
    const insert = vi.fn();

    expect(await createCatalogProduct(input, null, insert)).toEqual({ ok: false, error: "workspace_not_found" });
    expect(insert).not.toHaveBeenCalled();
  });
});

// Compra de mais unidades de um produto que já está no estoque: vira um lote com o preço pago.
describe("registerPurchase", () => {
  const input = { quantity: "5", cost: "30" };

  it("registra a compra com a quantidade e o preço por unidade em centavos", async () => {
    const purchase = vi.fn().mockResolvedValue("purchased");

    expect(await registerPurchase(input, PRODUCT_ID, purchase)).toEqual({ ok: true });
    expect(purchase).toHaveBeenCalledWith(PRODUCT_ID, { quantity: 5, unitCostCents: 3000 });
  });

  it("aceita espaços nas pontas e preço zero (brinde)", async () => {
    const purchase = vi.fn().mockResolvedValue("purchased");

    await registerPurchase({ quantity: " 2 ", cost: " 0 " }, PRODUCT_ID, purchase);

    expect(purchase).toHaveBeenCalledWith(PRODUCT_ID, { quantity: 2, unitCostCents: 0 });
  });

  it.each([
    ["entrada que não é objeto", null, "invalid_input"],
    ["quantidade que não é texto", { ...input, quantity: 5 }, "invalid_input"],
    ["preço que não é texto", { ...input, cost: 30 }, "invalid_input"],
    ["quantidade zero", { ...input, quantity: "0" }, "invalid_quantity"],
    ["quantidade fracionada", { ...input, quantity: "1.5" }, "invalid_quantity"],
    ["quantidade acima de 1.000.000", { ...input, quantity: "1000001" }, "invalid_quantity"],
    ["preço negativo", { ...input, cost: "-1" }, "invalid_cost"],
    ["preço vazio", { ...input, cost: " " }, "invalid_cost"],
  ])("recusa %s", async (_label, purchaseInput, error) => {
    const purchase = vi.fn();

    expect(await registerPurchase(purchaseInput, PRODUCT_ID, purchase)).toEqual({ ok: false, error });
    expect(purchase).not.toHaveBeenCalled();
  });

  it("sem produto, ou quando ele não está no estoque, devolve não encontrado", async () => {
    expect(await registerPurchase(input, null, vi.fn())).toEqual({ ok: false, error: "product_not_found" });
    expect(await registerPurchase(input, PRODUCT_ID, vi.fn().mockResolvedValue("not_found"))).toEqual({
      ok: false,
      error: "product_not_found",
    });
  });
});

// Ajuste pela contagem (perda, quebra, uso sem registro): a quantidade só diminui, tirando dos
// lotes mais antigos; o que entra é compra.
describe("adjustStock", () => {
  it("ajusta para a quantidade contada", async () => {
    const adjust = vi.fn().mockResolvedValue("adjusted");

    expect(await adjustStock({ quantity: " 3 " }, PRODUCT_ID, adjust)).toEqual({ ok: true });
    expect(adjust).toHaveBeenCalledWith(PRODUCT_ID, 3);
  });

  it("aceita zerar", async () => {
    const adjust = vi.fn().mockResolvedValue("adjusted");

    await adjustStock({ quantity: "0" }, PRODUCT_ID, adjust);

    expect(adjust).toHaveBeenCalledWith(PRODUCT_ID, 0);
  });

  it.each([
    ["entrada que não é objeto", null, "invalid_input"],
    ["quantidade que não é texto", { quantity: 3 }, "invalid_input"],
    ["quantidade negativa", { quantity: "-1" }, "invalid_quantity"],
    ["quantidade vazia", { quantity: "" }, "invalid_quantity"],
  ])("recusa %s", async (_label, adjustInput, error) => {
    const adjust = vi.fn();

    expect(await adjustStock(adjustInput, PRODUCT_ID, adjust)).toEqual({ ok: false, error });
    expect(adjust).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", "product_not_found"],
    ["above_current", "above_current"],
  ])("repassa o resultado %s da escrita", async (outcome, error) => {
    expect(await adjustStock({ quantity: "3" }, PRODUCT_ID, vi.fn().mockResolvedValue(outcome))).toEqual({
      ok: false,
      error,
    });
  });

  it("sem produto, devolve não encontrado", async () => {
    expect(await adjustStock({ quantity: "3" }, null, vi.fn())).toEqual({ ok: false, error: "product_not_found" });
  });
});
