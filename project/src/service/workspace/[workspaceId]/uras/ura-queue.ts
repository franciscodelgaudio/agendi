import { Queue, Worker, type ConnectionOptions } from "bullmq"
import type { InboundJob, TimerJob } from "@/service/workspace/[workspaceId]/uras/ura-runner"

// Fila das URAs no Redis (REDIS_URL). Sem Redis configurado, as URAs não rodam.
const QUEUE_NAME = "ura"

type UraJob = { name: "inbound"; data: InboundJob } | { name: "timer"; data: TimerJob }

export const isUraQueueConfigured = () => !!process.env.REDIS_URL

const connection = (): ConnectionOptions => ({ url: process.env.REDIS_URL, maxRetriesPerRequest: null })

const globalForQueue = globalThis as unknown as { _uraQueue?: Queue; _uraWorker?: Worker }

function queue() {
  globalForQueue._uraQueue ??= new Queue(QUEUE_NAME, {
    connection: connection(),
    defaultJobOptions: {
      // StaleSessionError (corrida entre rodadas) e falhas de rede tentam de novo.
      attempts: 5,
      backoff: { type: "exponential", delay: 500 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  })
  return globalForQueue._uraQueue
}

export async function enqueueInbound(job: InboundJob) {
  if (!isUraQueueConfigured()) return
  await queue().add("inbound", job)
}

// Um job por timer e versão: agendar de novo o mesmo timer não duplica.
export async function scheduleTimer(job: TimerJob, at: Date) {
  if (!isUraQueueConfigured()) return
  await queue().add("timer", job, {
    jobId: `${job.kind}-${job.sessionId}-${job.version}`,
    delay: Math.max(0, at.getTime() - Date.now()),
  })
}

// Um worker por processo do servidor (instrumentation.ts); no dev, sobrevive ao hot reload.
export function startUraWorker(handle: (job: UraJob) => Promise<void>) {
  if (!isUraQueueConfigured() || globalForQueue._uraWorker) return
  const concurrency = Number(process.env.URA_WORKER_CONCURRENCY) || 5
  globalForQueue._uraWorker = new Worker(QUEUE_NAME, (job) => handle({ name: job.name, data: job.data } as UraJob), {
    connection: connection(),
    concurrency,
  })
  globalForQueue._uraWorker.on("failed", (job, error) => {
    console.error(`[ura] job ${job?.name} ${job?.id} failed: ${error.message}`)
  })
}
