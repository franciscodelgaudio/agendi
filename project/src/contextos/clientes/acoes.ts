"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { can } from "@/service/workspace/[workspaceId]/users/permissions/permissions"
import { findManagedWorkspace, findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import { atualizarCliente, cadastrarCliente, type ErroDoCadastro } from "./aplicacao/cadastro"
import { buscarClientesParaEscolha } from "./consultas"
import { clientesNoBanco, cpfDuplicadoNoBanco } from "./infraestrutura/clientes-no-banco"

// Quem gerencia agendamentos gerencia os clientes (decisão da fase 3.3).
const PERMISSAO = "bookings.manage"

const mensagens: Record<ErroDoCadastro | "workspace_not_found" | "unauthenticated", string> = {
  entrada_invalida: "Preencha nome e CPF.",
  nome_invalido: "Informe o nome do cliente.",
  nome_longo: "O nome pode ter no máximo 80 caracteres.",
  cpf_invalido: "Informe um CPF válido.",
  cpf_em_uso: "Já existe um cliente com este CPF.",
  telefone_invalido: "Informe cada telefone com DDD, por exemplo (11) 98765-4321.",
  telefones_demais: "Cadastre no máximo 5 telefones.",
  email_invalido: "Informe um e-mail válido.",
  observacoes_longas: "As observações podem ter no máximo 500 caracteres.",
  cliente_nao_encontrado: "Cliente não encontrado ou sem permissão.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type ClienteActionState = { error: string | null }

function entradaDoFormulario(formData: FormData) {
  return {
    nome: formData.get("name"),
    cpf: formData.get("cpf"),
    telefones: formData.getAll("phone"),
    email: formData.get("email"),
    observacoes: formData.get("notes"),
  }
}

// workspaceId vem do cliente; o acesso e a permissão são conferidos aqui.
async function empresaGerenciada(workspaceId: string): Promise<{ empresaId: string } | { error: string }> {
  const userId = await getSessionUserId()
  if (!userId) return { error: mensagens.unauthenticated }
  const managed = await findManagedWorkspace(workspaceId, userId, PERMISSAO)
  if (!managed.ok) {
    return { error: managed.error === "forbidden" ? forbiddenMessage(PERMISSAO) : mensagens[managed.error] }
  }
  return { empresaId: managed.access.id }
}

export async function cadastrarClienteAction(
  workspaceId: string,
  _prev: ClienteActionState,
  formData: FormData,
): Promise<ClienteActionState> {
  const alvo = await empresaGerenciada(workspaceId)
  if ("error" in alvo) return alvo

  try {
    const resultado = await cadastrarCliente(entradaDoFormulario(formData), alvo.empresaId, clientesNoBanco)
    if (!resultado.ok) return { error: mensagens[resultado.erro] }
  } catch (erro) {
    if (cpfDuplicadoNoBanco(erro)) return { error: mensagens.cpf_em_uso }
    throw erro
  }

  refresh()
  return { error: null }
}

export async function atualizarClienteAction(
  workspaceId: string,
  clienteId: string,
  _prev: ClienteActionState,
  formData: FormData,
): Promise<ClienteActionState> {
  const alvo = await empresaGerenciada(workspaceId)
  if ("error" in alvo) return alvo

  try {
    const resultado = await atualizarCliente(
      entradaDoFormulario(formData),
      { empresaId: alvo.empresaId, clienteId: isObjectIdOrHexString(clienteId) ? clienteId : null },
      { cpfEmUso: clientesNoBanco.cpfEmUso, atualizar: clientesNoBanco.atualizarNaEmpresa(alvo.empresaId) },
    )
    if (!resultado.ok) return { error: mensagens[resultado.erro] }
  } catch (erro) {
    if (cpfDuplicadoNoBanco(erro)) return { error: mensagens.cpf_em_uso }
    throw erro
  }

  refresh()
  return { error: null }
}

// Busca do seletor de cliente recorrente, para quem agenda ou registra atendimentos.
export async function buscarClientesAction(workspaceId: string, busca: string) {
  const userId = await getSessionUserId()
  if (!userId) return []
  const access = await findWorkspaceAccess(workspaceId, userId)
  if (!access || !(can(access.actor, "bookings.manage") || can(access.actor, "appointments.manage"))) return []
  return buscarClientesParaEscolha(access.id, typeof busca === "string" ? busca : "")
}
