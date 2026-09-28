// Roda uma vez ao subir cada servidor Next. O worker das URAs só existe no runtime Node
// e só com REDIS_URL definida.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.REDIS_URL) {
    const { registerUraWorker } = await import("@/lib/ura-worker")
    registerUraWorker()
  }
}
