import { redirect } from "next/navigation";
import { isObjectIdOrHexString, Types } from "mongoose";
import { auth } from "@/auth";

// Para páginas e layouts: sem sessão válida, manda para o login.
export async function requireUser() {
  const user = (await auth())?.user;
  if (!user?.id || !isObjectIdOrHexString(user.id)) redirect("/login");
  return { ...user, id: user.id };
}

// Para server actions: retorna null em vez de redirecionar, e a action
// decide a mensagem de erro.
export async function getSessionUserId() {
  const id = (await auth())?.user?.id;
  return id && isObjectIdOrHexString(id) ? id : null;
}

// Estágios que só encontram o workspace se o usuário for o dono ou um membro
// que aceitou o convite, e adicionam o campo role ("owner" ou a função do
// membro). Aggregation não converte string em ObjectId sozinho, então a
// conversão é feita aqui; id inválido vira null para a página responder 404
// sem ir ao banco. Sem assinatura ativa o workspace não é encontrado, o que barra
// páginas, server actions e rotas de API; só o layout usa allowUnpaid para mostrar
// a tela de planos.
export function workspaceAccessStages(
  workspaceId: string,
  userId: string,
  { now = new Date(), allowUnpaid = false }: { now?: Date; allowUnpaid?: boolean } = {},
) {
  if (!isObjectIdOrHexString(workspaceId)) return null;
  const userObjectId = new Types.ObjectId(userId);
  const paid = allowUnpaid
    ? {}
    : { "subscription.status": "active", "subscription.currentPeriodEnd": { $gt: now } };
  return [
    { $match: { _id: new Types.ObjectId(workspaceId), ...paid } },
    {
      $lookup: {
        from: "workspace_members",
        localField: "_id",
        foreignField: "workspaceId",
        as: "membership",
        pipeline: [{ $match: { userId: userObjectId } }, { $limit: 1 }, { $project: { _id: 0, role: 1 } }],
      },
    },
    {
      $set: {
        role: {
          $cond: [
            { $eq: ["$userId", userObjectId] },
            "owner",
            { $ifNull: [{ $first: "$membership.role" }, null] },
          ],
        },
      },
    },
    { $match: { role: { $ne: null } } },
    { $unset: "membership" },
  ];
}
