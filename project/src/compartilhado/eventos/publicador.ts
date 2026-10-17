import type { EventoDeDominio } from "./evento";

export type Consumidor<E extends EventoDeDominio = EventoDeDominio> = (evento: E) => Promise<void>;

export type FalhaDoConsumidor = { consumidor: string; evento: EventoDeDominio; erro: unknown };

// Entrega no mesmo processo, logo depois da escrita de quem publica: cada consumidor do tipo,
// um de cada vez, na ordem em que assinou. A escrita de quem publicou já aconteceu, então a
// falha de um consumidor não desfaz nada nem impede os outros: vai para aoFalhar.
export function criarPublicador({ aoFalhar }: { aoFalhar: (falha: FalhaDoConsumidor) => void }) {
  const inscritos = new Map<string, { nome: string; consumir: Consumidor }[]>();

  return {
    assinar<E extends EventoDeDominio>(tipo: E["tipo"], nome: string, consumir: Consumidor<E>) {
      const lista = inscritos.get(tipo) ?? [];
      // Assinar duas vezes entregaria o mesmo evento em dobro.
      if (lista.some((inscrito) => inscrito.nome === nome)) {
        throw new Error(`O consumidor "${nome}" já assina "${tipo}".`);
      }
      lista.push({ nome, consumir: consumir as Consumidor });
      inscritos.set(tipo, lista);
    },

    async publicar(evento: EventoDeDominio) {
      for (const { nome, consumir } of inscritos.get(evento.tipo) ?? []) {
        try {
          await consumir(evento);
        } catch (erro) {
          aoFalhar({ consumidor: nome, evento, erro });
        }
      }
    },
  };
}

export type Publicador = ReturnType<typeof criarPublicador>;
