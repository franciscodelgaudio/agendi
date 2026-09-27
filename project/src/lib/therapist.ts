import type { PipelineStage } from "mongoose";

// Estágios aplicados sobre o documento do workspace que montam o campo therapists
// (quem pode atender): o proprietário primeiro, depois os membros com função de
// massagista que aceitaram o convite, por nome. O id é sempre o do usuário; image
// é a foto dele, ou null.
export function therapistOptionsStages(): PipelineStage[] {
  return [
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "ownerOption",
        pipeline: [
          {
            $project: {
              _id: 0,
              id: { $toString: "$_id" },
              name: { $ifNull: ["$name", "$email"] },
              image: { $ifNull: ["$image", null] },
            },
          },
        ],
      },
    },
    {
      $lookup: {
        from: "workspace_members",
        localField: "_id",
        foreignField: "workspaceId",
        as: "memberOptions",
        pipeline: [
          { $match: { role: "massage_therapist", userId: { $ne: null } } },
          { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
          // Membro cujo usuário não existe mais fica de fora (sem nome, não tem como aparecer).
          { $unwind: "$user" },
          {
            $project: {
              _id: 0,
              id: { $toString: "$userId" },
              name: { $ifNull: ["$user.name", "$user.email"] },
              image: { $ifNull: ["$user.image", null] },
            },
          },
          { $sort: { name: 1, id: 1 } },
        ],
      },
    },
    { $set: { therapists: { $concatArrays: ["$ownerOption", "$memberOptions"] } } },
    { $unset: ["ownerOption", "memberOptions"] },
  ];
}
