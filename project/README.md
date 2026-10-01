# Agendi

Plataforma de gestão para negócios de beleza e bem-estar.

Repositório: [franciscodelgaudio/agendi](https://github.com/franciscodelgaudio/agendi).

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Integração WhatsApp e Instagram (Meta)

As Conversas recebem mensagens pelo webhook `POST /api/webhooks/meta` (WhatsApp Cloud API e Instagram) e respondem pela Graph API. Cada workspace conecta seus números e contas em **Configurações → Canais**.

### Variáveis de ambiente

| Variável | Uso |
|---|---|
| `META_APP_SECRET` | Segredo do app da Meta. Valida a assinatura `X-Hub-Signature-256` do webhook. |
| `INSTAGRAM_APP_SECRET` | Opcional. Segredo do app do Instagram, se for diferente do anterior. |
| `META_WEBHOOK_VERIFY_TOKEN` | Texto qualquer. Precisa ser o mesmo informado no painel da Meta. |
| `MESSAGING_ENCRYPTION_KEY` | Chave que encripta os tokens dos canais no banco: `openssl rand -base64 32`. |
| `META_GRAPH_API_VERSION` | Opcional. Padrão: `v23.0`. |
| `APP_URL` | Já usado pelos convites. Monta a URL do webhook exibida em Canais. |

Trocar a `MESSAGING_ENCRYPTION_KEY` invalida os tokens salvos, e eles precisam ser cadastrados de novo em Canais.

### Painel da Meta

1. **Webhook**: Callback URL `https://<APP_URL>/api/webhooks/meta` e Verify token = `META_WEBHOOK_VERIFY_TOKEN`.
   - WhatsApp: assine o campo `messages`.
   - Instagram: assine `messages` e `message_reads`.
2. **Canal WhatsApp**: *Phone number ID* do número e um token de acesso permanente (usuário do sistema) com `whatsapp_business_messaging`.
3. **Canal Instagram** (API com login do Instagram): ID da conta profissional e o token da conta com `instagram_business_manage_messages`.

Em desenvolvimento, exponha a porta local com um túnel HTTPS (ex.: `ngrok http 3000`) e use essa URL no `APP_URL` e no webhook.

### Regras

- Só é possível responder até 24h depois da última mensagem do cliente (regra da Meta). Templates para iniciar ou retomar conversa ainda não estão implementados.
- As Conversas atendem o proprietário, administradores e recepcionistas. Os canais são gerenciados pelo proprietário e por administradores.
