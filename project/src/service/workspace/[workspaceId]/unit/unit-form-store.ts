import type { PipelineStage } from "mongoose"

export function unitMemberOptionsStages(): PipelineStage[] {
  return [
    {
      $lookup: {
        from: "workspace_members",
        localField: "_id",
        foreignField: "workspaceId",
        as: "members",
        pipeline: [
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          { $unwind: "$user" },
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: { $ifNull: ["$user.name", "$user.email"] },
              image: { $ifNull: ["$user.avatarUrl", null] },
            },
          },
          { $sort: { name: 1, id: 1 } },
        ],
      },
    },
  ]
}

function nameOptionsLookup(from: string, as: string): PipelineStage {
  return {
    $lookup: {
      from,
      localField: "_id",
      foreignField: "workspaceId",
      as,
      pipeline: [
        { $sort: { name: 1, _id: 1 } },
        { $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } },
      ],
    },
  }
}

export function unitRefOptionsStages(): PipelineStage[] {
  return [nameOptionsLookup("wallets", "wallets"), nameOptionsLookup("inventories", "inventories")]
}
