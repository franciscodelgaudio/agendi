import { Types, type PipelineStage } from "mongoose";

const attendsRoleCond = {
  $or: [{ $eq: ["$$this.admin", true] }, { $in: ["attends", { $ifNull: ["$$this.permissions", []] }] }],
};

export function therapistOptionsStages(unitId?: string): PipelineStage[] {
  return [
    {
      $set: {
        therapistRoleIds: {
          $map: {
            input: { $filter: { input: { $ifNull: ["$roles", []] }, cond: attendsRoleCond } },
            in: "$$this._id",
          },
        },
      },
    },
    {
      $lookup: {
        from: "workspace_members",
        localField: "_id",
        foreignField: "workspaceId",
        let: { roleIds: "$therapistRoleIds" },
        as: "therapists",
        pipeline: [
          { $match: { $expr: { $in: ["$roleId", "$$roleIds"] } } },
          {
            $lookup: {
              from: "units",
              localField: "_id",
              foreignField: "workspaceMemberIds",
              as: "memberUnits",
              pipeline: [{ $project: { _id: 1 } }],
            },
          },
          ...(unitId ? [{ $match: { "memberUnits._id": new Types.ObjectId(unitId) } }] : []),
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          { $unwind: "$user" },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: { $ifNull: ["$user.name", "$user.email"] },
              image: { $ifNull: ["$user.avatarUrl", null] },
              unitIds: { $map: { input: "$memberUnits", in: { $toString: "$$this._id" } } },
            },
          },
          { $sort: { name: 1, id: 1 } },
        ],
      },
    },
    { $unset: "therapistRoleIds" },
  ];
}

export function memberAttendsStages(): PipelineStage.FacetPipelineStage[] {
  return [
    {
      $lookup: {
        from: "workspaces",
        localField: "workspaceId",
        foreignField: "_id",
        as: "attendsWorkspace",
        pipeline: [{ $project: { _id: 0, roles: 1 } }],
      },
    },
    {
      $set: {
        attendsRole: {
          $first: {
            $filter: {
              input: { $ifNull: [{ $first: "$attendsWorkspace.roles" }, []] },
              cond: { $eq: ["$$this._id", "$roleId"] },
            },
          },
        },
      },
    },
    {
      $set: {
        attends: {
          $or: [
            { $eq: ["$attendsRole.admin", true] },
            { $in: ["attends", { $ifNull: ["$attendsRole.permissions", []] }] },
          ],
        },
      },
    },
    { $unset: ["attendsWorkspace", "attendsRole"] },
  ];
}
