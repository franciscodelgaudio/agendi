import type { Publicador } from "@/compartilhado/eventos";
import type { UnidadeCriada } from "@/contextos/organizacao";
import { criarCarteiraPropria } from "./aplicacao/criar-carteira-propria";
import { carteirasNoBanco } from "./infraestrutura/carteiras";

// Eventos de outros contextos que o Financeiro consome.
export function inscreverConsumidoresDoFinanceiro(publicador: Publicador) {
  publicador.assinar<UnidadeCriada>("UnidadeCriada", "financeiro.carteira-propria", (evento) =>
    criarCarteiraPropria(evento, carteirasNoBanco),
  );
}
