import { redirect } from "next/navigation";
import { isObjectIdOrHexString, Types } from "mongoose";
import { auth } from "@/auth";

export async function requireUser() {
  const user = (await auth())?.user;
  if (!user?.id || !isObjectIdOrHexString(user.id)) redirect("/login");
  return { ...user, id: user.id };
}

export async function getSessionUserId() {
  const id = (await auth())?.user?.id;
  return id && isObjectIdOrHexString(id) ? id : null;
}

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
        pipeline: [{ $match: { userId: userObjectId } }, { $limit: 1 }, { $project: { _id: 0, roleId: 1 } }],
      },
    },
    {
      $set: {
        actor: {
          $let: {
            vars: {
              role: {
                $first: {
                  $filter: {
                    input: { $ifNull: ["$roles", []] },
                    cond: { $eq: ["$$this._id", { $first: "$membership.roleId" }] },
                  },
                },
              },
            },
            in: {
              $switch: {
                branches: [
                  { case: { $eq: ["$$role.admin", true] }, then: { admin: true } },
                  {
                    case: { $ne: [{ $ifNull: ["$$role", null] }, null] },
                    then: { admin: false, permissions: "$$role.permissions", pages: "$$role.pages" },
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
