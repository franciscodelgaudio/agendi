"use server"

import { refresh } from "next/cache"
import { isObjectIdOrHexString, Types } from "mongoose"
import { getSessionUserId } from "@/service/(auth)/session"
import { forbiddenMessage } from "@/service/workspace/[workspaceId]/users/permissions/access-check"
import { findWorkspaceAccess } from "@/service/workspace/[workspaceId]/workspace-access"
import {
  createWallet,
  deleteWallet,
  updateWallet,
  type CreateWalletError,
  type DeleteWalletError,
  type UpdateWalletError,
} from "@/service/workspace/[workspaceId]/cash-flow/wallet"
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
  type CreateTransactionError,
  type DeleteTransactionError,
  type UpdateTransactionError,
} from "@/service/workspace/[workspaceId]/cash-flow/wallets/[walletId]/transaction"
import { insertWallet } from "@/service/workspace/[workspaceId]/cash-flow/wallet-store"
import { Transaction } from "@/models/Transaction"
import { Unit } from "@/models/Unit"
import { Wallet } from "@/models/Wallet"

type WalletError =
  | CreateWalletError
  | UpdateWalletError
  | DeleteWalletError
  | CreateTransactionError
  | UpdateTransactionError
  | DeleteTransactionError

const errorMessages: Record<Exclude<WalletError, "forbidden"> | "unauthenticated", string> = {
  invalid_input: "Preencha todos os campos.",
  invalid_name: "Informe o nome.",
  name_too_long: "O nome ficou longo demais.",
  invalid_opening_balance: "Informe um saldo inicial de até R$ 1.000.000,00.",
  invalid_opening_balance_date: "Informe o dia do saldo inicial.",
  invalid_total: "Informe um valor maior que zero, como 150,00.",
  invalid_type: "Escolha entrada ou saída.",
  invalid_paid_at: "Informe um dia de pagamento válido.",
  wallet_not_found: "Carteira não encontrada neste workspace.",
  wallet_in_use: "Alguma unidade ainda usa esta carteira. Troque a carteira dela antes.",
  wallet_has_transactions: "Esta carteira tem transações. Exclua as transações antes.",
  transaction_not_found: "Transação não encontrada nesta carteira.",
  transaction_from_appointment: "Esta entrada vem de um atendimento. Altere o atendimento.",
  workspace_not_found: "Workspace não encontrado ou sem permissão.",
  unauthenticated: "Sua sessão expirou. Entre novamente.",
}

export type WalletFormState = { error: string | null }

function messageOf(error: WalletError | "unauthenticated") {
  return error === "forbidden" ? forbiddenMessage("cash_flow.manage") : errorMessages[error]
}

async function sessionAccess(workspaceId: string) {
  const userId = await getSessionUserId()
  if (!userId) return null
  const access = await findWorkspaceAccess(workspaceId, userId)
  return { workspaceId: access?.id ?? workspaceId, actor: access?.actor ?? null }
}

function workspaceFilter(workspaceId: string, id: string) {
  if (!isObjectIdOrHexString(workspaceId) || !isObjectIdOrHexString(id)) return null
  return { _id: new Types.ObjectId(id), workspaceId: new Types.ObjectId(workspaceId) }
}

export async function createWalletAction(
  workspaceId: string,
  _prev: WalletFormState,
  formData: FormData,
): Promise<WalletFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }

  const result = await createWallet(
    {
      name: formData.get("name"),
      openingBalance: { amount: formData.get("openingBalance"), date: formData.get("openingBalanceDate") },
    },
    session,
    { insert: insertWallet },
  )

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function updateWalletAction(
  workspaceId: string,
  walletId: string,
  _prev: WalletFormState,
  formData: FormData,
): Promise<WalletFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = workspaceFilter(session.workspaceId, walletId)

  const result = await updateWallet({ name: formData.get("name") }, filter && walletId, session, {
    update: async (_id, data) => (await Wallet.updateOne(filter!, { $set: data })).matchedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function deleteWalletAction(workspaceId: string, walletId: string): Promise<WalletFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = workspaceFilter(session.workspaceId, walletId)

  const result = await deleteWallet(filter && walletId, session, {
    hasUnits: async () => !!(await Unit.exists({ walletId: filter!._id })),
    hasTransactions: async () => !!(await Transaction.exists({ walletId: filter!._id })),
    remove: async () => (await Wallet.deleteOne(filter!)).deletedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

function transactionInput(formData: FormData) {
  return {
    name: formData.get("name"),
    total: formData.get("total"),
    type: formData.get("type"),
    paidAt: formData.get("paidAt"),
  }
}

async function findTransaction(filter: ReturnType<typeof workspaceFilter>) {
  const transaction = filter && (await Transaction.findOne(filter).select({ appointmentId: 1 }).lean())
  return transaction ? { fromAppointment: !!transaction.appointmentId } : null
}

export async function createTransactionAction(
  workspaceId: string,
  walletId: string,
  _prev: WalletFormState,
  formData: FormData,
): Promise<WalletFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const walletFilter = workspaceFilter(session.workspaceId, walletId)

  const result = await createTransaction(transactionInput(formData), walletFilter && walletId, session, {
    walletExists: async () => !!(await Wallet.exists(walletFilter!)),
    insert: async (data) => {
      const transaction = await Transaction.create(data)
      return { id: transaction._id.toString() }
    },
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function updateTransactionAction(
  workspaceId: string,
  transactionId: string,
  _prev: WalletFormState,
  formData: FormData,
): Promise<WalletFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = workspaceFilter(session.workspaceId, transactionId)

  const result = await updateTransaction(transactionInput(formData), filter && transactionId, session, {
    findTransaction: () => findTransaction(filter),
    update: async (_id, data) => (await Transaction.updateOne(filter!, { $set: data })).matchedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}

export async function deleteTransactionAction(workspaceId: string, transactionId: string): Promise<WalletFormState> {
  const session = await sessionAccess(workspaceId)
  if (!session) return { error: messageOf("unauthenticated") }
  const filter = workspaceFilter(session.workspaceId, transactionId)

  const result = await deleteTransaction(filter && transactionId, session, {
    findTransaction: () => findTransaction(filter),
    remove: async () => (await Transaction.deleteOne(filter!)).deletedCount > 0,
  })

  if (!result.ok) return { error: messageOf(result.error) }

  refresh()
  return { error: null }
}
