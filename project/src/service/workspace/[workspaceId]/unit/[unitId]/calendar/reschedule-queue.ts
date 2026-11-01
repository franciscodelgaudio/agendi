export type RescheduleTimes = { startsAt: string; endsAt: string };

type Options = {
  // Rejeitar é falha de rede (tenta de novo); { error } é recusa do servidor.
  save: (id: string, times: RescheduleTimes) => Promise<{ error: string | null }>;
  onError: (error: string) => void;
  onRetry: (error: unknown) => void;
  onSaved: () => void;
  onIdle: () => void;
  retryDelay: (attempt: number) => number;
  wait: (ms: number) => Promise<void>;
};

// Remarcações salvas uma de cada vez, na ordem dos arrastes, para o banco conferir conflitos
// na mesma sequência que o usuário viu no calendário.
export function createRescheduleQueue(options: Options) {
  const items: { id: string; times: RescheduleTimes }[] = [];
  let running = false;

  async function run() {
    running = true;
    while (items.length) {
      const { id, times } = items[0];
      let result: { error: string | null };
      for (let attempt = 1; ; attempt++) {
        try {
          result = await options.save(id, times);
          break;
        } catch (error) {
          options.onRetry(error);
          await options.wait(options.retryDelay(attempt));
        }
      }
      items.shift();
      if (result.error) options.onError(result.error);
      else options.onSaved();
    }
    running = false;
    options.onIdle();
  }

  return {
    push(id: string, times: RescheduleTimes) {
      items.push({ id, times });
      if (!running) void run();
    },
    pending: () => running,
  };
}
