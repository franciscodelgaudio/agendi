export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// SVG fica de fora porque pode carregar script.
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type UploadImageError = "missing_file" | "invalid_type" | "too_large" | "upload_failed";

export type UploadImageDeps = {
  publicUrl: string;
  put: (key: string, body: Blob, contentType: string) => Promise<void>;
  randomId: () => string;
};

// Valida a imagem, envia para `<pasta>/<id>.<ext>` no storage e devolve a URL pública.
export async function uploadImage(
  file: unknown,
  folder: string,
  { publicUrl, put, randomId }: UploadImageDeps,
): Promise<{ ok: true; url: string } | { ok: false; error: UploadImageError }> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "missing_file" };
  const ext = EXTENSIONS[file.type];
  if (!ext) return { ok: false, error: "invalid_type" };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "too_large" };

  const key = `${folder}/${randomId()}.${ext}`;
  try {
    await put(key, file, file.type);
  } catch (error) {
    console.error("Falha ao enviar imagem ao storage", error);
    return { ok: false, error: "upload_failed" };
  }
  return { ok: true, url: `${publicUrl.replace(/\/+$/, "")}/${key}` };
}
