// Código curto do documento: reticências e os últimos 5 caracteres do _id que o Mongo cria.
export function recordCode(id: string) {
  return `…${id.slice(-5)}`
}
