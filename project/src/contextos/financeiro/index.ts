// API pública do Financeiro. Sem infraestrutura aqui: os consumidores ligados ao banco são
// inscritos pela raiz de composição (contextos/barramento.ts).
export { criarCarteiraPropria, type NovaCarteira } from "./aplicacao/criar-carteira-propria";
