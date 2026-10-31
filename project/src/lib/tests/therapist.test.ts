import { describe, it, expect } from "vitest";
import { memberAttendsStages, therapistOptionsStages } from "@/service/workspace/[workspaceId]/team/therapist";

const attendsRoleCond = {
  $or: [{ $eq: ["$$this.admin", true] }, { $in: ["attends", { $ifNull: ["$$this.permissions", []] }] }],
};

describe("therapistOptionsStages", () => {
  it("monta o campo therapists com os membros cuja role do workspace é admin ou realiza atendimentos", () => {
    expect(therapistOptionsStages()).toEqual([
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
            { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
            { $unwind: "$user" },
            {
              $project: {
                _id: 0,
                id: { $toString: "$userId" },
                name: { $ifNull: ["$user.name", "$user.email"] },
                image: { $ifNull: ["$user.avatarUrl", null] },
              },
            },
            { $sort: { name: 1, id: 1 } },
          ],
        },
      },
      { $unset: "therapistRoleIds" },
    ]);
  });
});

describe("memberAttendsStages", () => {
  it("marca attends no membro quando a role dele no workspace é admin ou realiza atendimentos", () => {
    expect(memberAttendsStages()).toEqual([
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
    ]);
  });
});
