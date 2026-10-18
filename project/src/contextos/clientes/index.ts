// API pública de Clientes, sem infraestrutura. Telas usam `@/contextos/clientes/acoes` (server
// actions) e `@/contextos/clientes/consultas` (leituras no servidor).
export {
  lerCliente,
  normalizarCpf,
  normalizarTelefone,
  type DadosDoCliente,
  type ErroDoCliente,
} from "./dominio/cliente";
export { atualizarCliente, cadastrarCliente, type ErroDoCadastro } from "./aplicacao/cadastro";
