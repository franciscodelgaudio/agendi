import { describe, it, expect, vi } from "vitest";
import { Types } from "mongoose";

// session.ts importa o Auth.js, que não roda fora do Next; só o pipeline importa aqui.
vi.mock("@/auth", () => ({ auth: vi.fn() }));

const { workspaceAccessStages } = await import("@/service/(auth)/session");

const WORKSPACE_ID = "64b7f0c2a1b2c3d4e5f60718";
const USER_ID = "64b7f0c2a1b2c3d4e5f60719";

describe("workspaceAccessStages", () => {
  it("encontra o workspace pelo id e monta o acesso do membro que aceitou o convite", () => {
    const workspaceId = new Types.ObjectId(WORKSPACE_ID);
    const userId = new Types.ObjectId(USER_ID);

    expect(workspaceAccessStages(WORKSPACE_ID, USER_ID)).toEqual([
      { $match: { _id: workspaceId } },
      {
        $lookup: {
          from: "workspace_members",
          localField: "_id",
          foreignField: "workspaceId",
          as: "membership",
          pipeline: [{ $match: { userId } }, { $limit: 1 }, { $project: { _id: 0, roleId: 1 } }],
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
    ]);
  });

  it.each(["", "abc", "not-an-object-id"])(
    "retorna null quando o workspaceId é inválido (%j), para a página responder 404 sem ir ao banco",
    (workspaceId) => {
      expect(workspaceAccessStages(workspaceId, USER_ID)).toBeNull();
    },
  );
});
