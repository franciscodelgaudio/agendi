import { describe, it, expect, vi } from "vitest";
import { uploadImage, MAX_IMAGE_BYTES } from "@/service/workspace/[workspaceId]/uploads/image-upload";

const FOLDER = "workspaces/665f1c2e8b3a4d0012345678/products";

function image(type: string, bytes = 10) {
  return new File([new Uint8Array(bytes)], "foto qualquer.bin", { type });
}

function deps(overrides: Partial<Parameters<typeof uploadImage>[2]> = {}) {
  return {
    publicUrl: "https://cdn.agendi.com",
    put: vi.fn().mockResolvedValue(undefined),
    randomId: () => "a1b2c3",
    ...overrides,
  };
}

describe("uploadImage", () => {
  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
  ])("envia %s para a pasta com id aleatório e extensão .%s, e devolve a URL pública", async (type, ext) => {
    const d = deps();
    const file = image(type);

    const result = await uploadImage(file, FOLDER, d);

    expect(result).toEqual({ ok: true, url: `https://cdn.agendi.com/${FOLDER}/a1b2c3.${ext}` });
    expect(d.put).toHaveBeenCalledTimes(1);
    expect(d.put).toHaveBeenCalledWith(`${FOLDER}/a1b2c3.${ext}`, file, type);
  });

  it("não duplica a barra quando a URL pública termina com /", async () => {
    const result = await uploadImage(image("image/png"), FOLDER, deps({ publicUrl: "https://cdn.agendi.com/" }));

    expect(result).toEqual({ ok: true, url: `https://cdn.agendi.com/${FOLDER}/a1b2c3.png` });
  });

  it("aceita imagem exatamente no tamanho máximo", async () => {
    const result = await uploadImage(image("image/png", MAX_IMAGE_BYTES), FOLDER, deps());

    expect(result.ok).toBe(true);
  });

  it.each([
    ["null (campo ausente no FormData)", null],
    ["string", "https://example.com/a.png"],
    ["arquivo vazio", new File([], "vazio.png", { type: "image/png" })],
  ])("recusa sem enviar quando o arquivo é %s", async (_label, file) => {
    const d = deps();

    const result = await uploadImage(file, FOLDER, d);

    expect(result).toEqual({ ok: false, error: "missing_file" });
    expect(d.put).not.toHaveBeenCalled();
  });

  it.each([
    ["SVG (pode carregar script)", "image/svg+xml"],
    ["GIF", "image/gif"],
    ["PDF", "application/pdf"],
    ["sem tipo", ""],
  ])("recusa sem enviar quando o tipo é %s", async (_label, type) => {
    const d = deps();

    const result = await uploadImage(image(type), FOLDER, d);

    expect(result).toEqual({ ok: false, error: "invalid_type" });
    expect(d.put).not.toHaveBeenCalled();
  });

  it("recusa sem enviar quando passa do tamanho máximo", async () => {
    const d = deps();

    const result = await uploadImage(image("image/jpeg", MAX_IMAGE_BYTES + 1), FOLDER, d);

    expect(result).toEqual({ ok: false, error: "too_large" });
    expect(d.put).not.toHaveBeenCalled();
  });

  it("devolve upload_failed quando o envio ao storage falha", async () => {
    const d = deps({ put: vi.fn().mockRejectedValue(new Error("R2 403")) });

    const result = await uploadImage(image("image/png"), FOLDER, d);

    expect(result).toEqual({ ok: false, error: "upload_failed" });
  });
});
