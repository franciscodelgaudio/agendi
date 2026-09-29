import { createGoogleGenerativeAI } from "@ai-sdk/google"

// Modelo da AgenIA; AGENIA_MODEL troca sem mexer no código.
export const AGENIA_MODEL = process.env.AGENIA_MODEL || "gemini-flash-latest"

export const isAgeniaConfigured = () => !!process.env.GEMINI_API_KEY

export function ageniaModel() {
  return createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })(AGENIA_MODEL)
}
