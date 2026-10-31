import { describe, it, expect } from "vitest";
import { Types } from "mongoose";
import { walletListPipeline } from "@/service/workspace/[workspaceId]/cash-flow/wallet-list";

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";

const paidSum = (type: string) => ({
  $sum: { $map: { input: { $filter: { input: "$paid", cond: { $eq: ["$$this._id", type] } } }, in: "$$this.cents" } },
});

describe("walletListPipeline", () => {
  it("lista as carteiras do workspace por nome, com as unidades e o saldo das transações pagas", () => {
    expect(walletListPipeline(WORKSPACE_ID)).toEqual([
      { $match: { workspaceId: new Types.ObjectId(WORKSPACE_ID) } },
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
    ]);
  });
});
