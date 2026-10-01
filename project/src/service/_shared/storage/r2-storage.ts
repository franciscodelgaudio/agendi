import { randomUUID } from "node:crypto"
import { AwsClient } from "aws4fetch"
import type { UploadImageDeps } from "@/service/workspace/[workspaceId]/uploads/image-upload"

// Cloudflare R2 pela API compatível com S3. As imagens são servidas pelo domínio público
// do bucket (R2_PUBLIC_URL), não pelo endpoint da API.
export function missingR2Env() {
  const required = {
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: process.env.R2_BUCKET,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  }
  return Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name)
}

// Só chame depois de conferir missingR2Env().
export function r2UploadDeps(): UploadImageDeps {
  const client = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  })
  const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}`
  return {
    publicUrl: process.env.R2_PUBLIC_URL!,
    randomId: randomUUID,
    put: async (key, body, contentType) => {
      // Assina e envia o buffer direto: via client.fetch o corpo vira stream e sai sem
      // Content-Length, que o R2 exige (411 MissingContentLength).
      const bytes = new Uint8Array(await body.arrayBuffer())
      const signed = await client.sign(`${endpoint}/${key}`, {
        method: "PUT",
        body: bytes,
        headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" },
      })
      const response = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: bytes })
      if (!response.ok) throw new Error(`R2 ${response.status}: ${await response.text()}`)
    },
  }
}
