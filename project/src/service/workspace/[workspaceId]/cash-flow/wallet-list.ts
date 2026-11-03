import { Types, type PipelineStage } from "mongoose";

export type WalletListItem = {
  id: string;
  name: string;
  units: { id: string; name: string }[];
  incomingCents: number;
  expenseCents: number;
  balanceCents: number;
};

function paidSum(type: "incoming" | "expense") {
  return {
    $sum: { $map: { input: { $filter: { input: "$paid", cond: { $eq: ["$$this._id", type] } } }, in: "$$this.cents" } },
  };
}

export function walletListPipeline(workspaceId: string): PipelineStage[] {
  return [
    { $match: { workspaceId: new Types.ObjectId(workspaceId) } },
    {
      $lookup: {
        from: "transactions",
        localField: "_id",
        foreignField: "walletId",
        as: "paid",
        pipeline: [{ $match: { paidAt: { $ne: null } } }, { $group: { _id: "$type", cents: { $sum: "$totalCents" } } }],
      },
    },
    {
      $lookup: {
        from: "units",
        localField: "_id",
        foreignField: "walletId",
        as: "units",
        pipeline: [{ $sort: { name: 1, _id: 1 } }, { $project: { _id: 0, id: { $toString: "$_id" }, name: 1 } }],
      },
    },
    {
      $project: {
        _id: 0,
        id: { $toString: "$_id" },
        name: 1,
        units: 1,
        incomingCents: paidSum("incoming"),
        expenseCents: paidSum("expense"),
      },
    },
    { $set: { balanceCents: { $subtract: ["$incomingCents", "$expenseCents"] } } },
    { $sort: { name: 1, id: 1 } },
  ];
}
