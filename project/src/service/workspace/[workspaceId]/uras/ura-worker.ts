import { startUraWorker } from "@/service/workspace/[workspaceId]/uras/ura-queue"
import { handleInbound, handleTimer } from "@/service/workspace/[workspaceId]/uras/ura-runner"
import { uraRunnerDeps } from "@/service/workspace/[workspaceId]/uras/ura-store"

export function registerUraWorker() {
  const deps = uraRunnerDeps()
  startUraWorker((job) => (job.name === "inbound" ? handleInbound(job.data, deps) : handleTimer(job.data, deps)))
}
