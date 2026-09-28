import { startUraWorker } from "@/lib/ura-queue"
import { handleInbound, handleTimer } from "@/lib/ura-runner"
import { uraRunnerDeps } from "@/lib/ura-store"

export function registerUraWorker() {
  const deps = uraRunnerDeps()
  startUraWorker((job) => (job.name === "inbound" ? handleInbound(job.data, deps) : handleTimer(job.data, deps)))
}
