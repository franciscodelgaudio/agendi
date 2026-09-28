import { createOpenAI } from "@ai-sdk/openai"

// Modelo da AgenIA; AGENIA_MODEL troca sem mexer no código.
export const AGENIA_MODEL = process.env.AGENIA_MODEL || "gpt-5.4-mini"

export const isAgeniaConfigured = () => !!process.env.OPENAI_API_KEY

export function ageniaModel() {
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(AGENIA_MODEL)
}
