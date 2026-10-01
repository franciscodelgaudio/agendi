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

// Estágios que só encontram o workspace se o usuário for um membro que aceitou o convite
// e tiver acesso, e adicionam o campo actor (ver Actor em permissions): administrador pode
// tudo; os demais, o que a role libera; membro sem role não entra. Aggregation não converte
// string em ObjectId sozinho, então a conversão é feita aqui; id inválido vira null para a
// página responder 404 sem ir ao banco. Sem assinatura ativa o workspace não é encontrado,
// o que barra páginas, server actions e rotas de API; só o layout usa allowUnpaid para
// mostrar a tela de planos.
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
        pipeline: [
          { $match: { userId: userObjectId } },
          { $limit: 1 },
          { $lookup: { from: "roles", localField: "roleId", foreignField: "_id", as: "role" } },
          { $project: { _id: 0, admin: 1, role: { $first: "$role" } } },
        ],
      },
    },
    {
      $set: {
        actor: {
          $let: {
            vars: { member: { $first: "$membership" } },
            in: {
              $switch: {
                branches: [
                  { case: { $eq: ["$$member.admin", true] }, then: { admin: true } },
                  {
                    case: { $ne: [{ $ifNull: ["$$member.role", null] }, null] },
                    then: { admin: false, permissions: "$$member.role.permissions", pages: "$$member.role.pages" },
                  },
                ],
                default: null,
              },
            },
          },
        },
      },
    },
    { $match: { actor: { $ne: null } } },
    { $unset: "membership" },
  ];
}
