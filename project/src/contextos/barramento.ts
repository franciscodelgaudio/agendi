import { criarPublicador } from "@/compartilhado/eventos";
// Raiz de composição: é o único lugar que importa o miolo dos contextos, para inscrever os
// consumidores ligados ao banco. O resto do sistema só usa `publicar`.
import { inscreverConsumidoresDoFinanceiro } from "./financeiro/consumidores";

// Entrega síncrona, no mesmo processo. Sem outbox ainda: a falha de um consumidor fica só no
// log, e o efeito dele se perde.
const publicador = criarPublicador({
  aoFalhar: ({ consumidor, evento, erro }) =>
    console.error(`Falha do consumidor ${consumidor} no evento ${evento.tipo} (${evento.id})`, erro),
});

inscreverConsumidoresDoFinanceiro(publicador);

export const publicar = publicador.publicar;
