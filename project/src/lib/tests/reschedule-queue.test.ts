import { describe, it, expect, vi } from "vitest";
import { createRescheduleQueue, type RescheduleTimes } from "@/service/workspace/[workspaceId]/unit/[unitId]/calendar/reschedule-queue";

const T9 = { startsAt: "2026-09-24T09:00", endsAt: "2026-09-24T10:00" };
const T10 = { startsAt: "2026-09-24T10:00", endsAt: "2026-09-24T11:00" };
const T11 = { startsAt: "2026-09-24T11:00", endsAt: "2026-09-24T12:00" };
const T14 = { startsAt: "2026-09-25T14:00", endsAt: "2026-09-25T15:30" };

type Result = { error: string | null };

// Cada chamada de save fica pendente até o teste resolvê-la (ou rejeitá-la).
function controlledSave() {
  const calls: {
    id: string;
    times: RescheduleTimes;
    resolve: (result: Result) => void;
    reject: (error: unknown) => void;
  }[] = [];
  const save = vi.fn(
    (id: string, times: RescheduleTimes) =>
      new Promise<Result>((resolve, reject) => calls.push({ id, times, resolve, reject })),
  );
  return { save, calls };
}

// Deixa as promessas pendentes andarem.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const { save, calls } = controlledSave();
  const handlers = {
    revert: vi.fn(),
    onError: vi.fn(),
    onRetry: vi.fn(),
    onSaved: vi.fn(),
    onIdle: vi.fn(),
  };
  const wait = vi.fn(() => Promise.resolve());
  const queue = createRescheduleQueue({ save, ...handlers, retryDelay: (attempt) => attempt * 1000, wait });
  return { queue, save, calls, wait, ...handlers };
}

describe("createRescheduleQueue", () => {
  it("salva uma remarcação e avisa quando a fila esvazia", async () => {
    const { queue, save, calls, onSaved, onIdle, revert } = setup();
    queue.push("a", T9, T10);
    expect(queue.pending()).toBe(true);
    expect(save).toHaveBeenCalledWith("a", T10);

    calls[0].resolve({ error: null });
    await flush();

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(revert).not.toHaveBeenCalled();
    expect(queue.pending()).toBe(false);
  });

  it("salva uma de cada vez, na ordem em que o usuário arrastou, mesmo entre agendamentos diferentes", async () => {
    const { queue, save, calls, onIdle } = setup();
    queue.push("a", T9, T10);
    queue.push("b", T10, T11);
    queue.push("a", T10, T14);

    expect(save).toHaveBeenCalledTimes(1);
    calls[0].resolve({ error: null });
    await flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(calls[1]).toMatchObject({ id: "b", times: T11 });
    expect(onIdle).not.toHaveBeenCalled();

    calls[1].resolve({ error: null });
    await flush();
    expect(calls[2]).toMatchObject({ id: "a", times: T14 });

    calls[2].resolve({ error: null });
    await flush();
    expect(save).toHaveBeenCalledTimes(3);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(queue.pending()).toBe(false);
  });

  it("recusada pelo servidor, volta o agendamento para o último horário salvo e mostra o erro", async () => {
    const { queue, calls, revert, onError, onIdle } = setup();
    queue.push("a", T9, T10);
    calls[0].resolve({ error: "Conflito de horário" });
    await flush();

    expect(onError).toHaveBeenCalledWith("Conflito de horário");
    expect(revert).toHaveBeenCalledWith("a", T9);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("recusada com outra remarcação do mesmo agendamento na fila, não volta e deixa a próxima tentar", async () => {
    const { queue, calls, revert, onError } = setup();
    queue.push("a", T9, T10);
    queue.push("a", T10, T11);
    calls[0].resolve({ error: "Conflito de horário" });
    await flush();

    expect(onError).toHaveBeenCalledWith("Conflito de horário");
    expect(revert).not.toHaveBeenCalled();
    expect(calls[1]).toMatchObject({ id: "a", times: T11 });

    calls[1].resolve({ error: null });
    await flush();
    expect(revert).not.toHaveBeenCalled();
  });

  it("volta para o último horário confirmado, não para o anterior ao arraste que falhou", async () => {
    const { queue, calls, revert } = setup();
    queue.push("a", T9, T10);
    queue.push("a", T10, T11);
    calls[0].resolve({ error: null });
    await flush();
    calls[1].resolve({ error: "Conflito de horário" });
    await flush();

    expect(revert).toHaveBeenCalledTimes(1);
    expect(revert).toHaveBeenCalledWith("a", T10);
  });

  it("todas recusadas, volta para o horário de antes do primeiro arraste", async () => {
    const { queue, calls, revert } = setup();
    queue.push("a", T9, T10);
    queue.push("a", T10, T11);
    calls[0].resolve({ error: "x" });
    await flush();
    calls[1].resolve({ error: "y" });
    await flush();

    expect(revert).toHaveBeenCalledTimes(1);
    expect(revert).toHaveBeenCalledWith("a", T9);
  });

  it("depois que a fila de um agendamento esvazia, o próximo arraste parte do horário informado de novo", async () => {
    const { queue, calls, revert } = setup();
    queue.push("a", T9, T10);
    calls[0].resolve({ error: null });
    await flush();
    queue.push("a", T11, T14);
    calls[1].resolve({ error: "x" });
    await flush();

    expect(revert).toHaveBeenCalledWith("a", T11);
  });

  it("falha de rede não perde a remarcação: tenta de novo a mesma, com espera crescente, sem pular a fila", async () => {
    const { queue, save, calls, wait, onRetry, onSaved, revert, onIdle } = setup();
    queue.push("a", T9, T10);
    queue.push("b", T10, T11);

    calls[0].reject(new Error("Failed to fetch"));
    await flush();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenLastCalledWith(1000);
    expect(calls[1]).toMatchObject({ id: "a", times: T10 });

    calls[1].reject(new Error("Failed to fetch"));
    await flush();
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenLastCalledWith(2000);
    expect(calls[2]).toMatchObject({ id: "a", times: T10 });

    calls[2].resolve({ error: null });
    await flush();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(revert).not.toHaveBeenCalled();
    expect(calls[3]).toMatchObject({ id: "b", times: T11 });

    calls[3].resolve({ error: null });
    await flush();
    expect(save).toHaveBeenCalledTimes(4);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("a espera entre tentativas recomeça em cada remarcação", async () => {
    const { queue, calls, wait } = setup();
    queue.push("a", T9, T10);
    queue.push("b", T10, T11);
    calls[0].reject(new Error("offline"));
    await flush();
    calls[1].resolve({ error: null });
    await flush();
    calls[2].reject(new Error("offline"));
    await flush();

    expect(wait.mock.calls).toEqual([[1000], [1000]]);
  });

  it("arraste feito enquanto a fila está andando entra no fim dela, sem salvar em paralelo", async () => {
    const { queue, save, calls, onIdle } = setup();
    queue.push("a", T9, T10);
    await flush();
    queue.push("b", T10, T11);
    expect(save).toHaveBeenCalledTimes(1);

    calls[0].resolve({ error: null });
    await flush();
    expect(calls[1]).toMatchObject({ id: "b", times: T11 });
    calls[1].resolve({ error: null });
    await flush();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
