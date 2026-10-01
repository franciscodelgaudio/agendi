import { describe, it, expect } from "vitest";
import { therapistOptionsStages } from "@/lib/therapist";

describe("therapistOptionsStages", () => {
  // Aplicadas sobre o documento do workspace: quem pode atender são os membros que
  // aceitaram o convite e são administradores ou têm uma role com "Realiza atendimentos",
  // por nome. O id é sempre o do usuário, o nome cai para o email quando não há e a foto
  // (image) vem como null quando o usuário não tem.
  it("monta o campo therapists com administradores e quem realiza atendimentos (com foto)", () => {
    expect(therapistOptionsStages()).toEqual([
      {
        $lookup: {
          from: "workspace_members",
          localField: "_id",
          foreignField: "workspaceId",
          as: "therapists",
          pipeline: [
            { $match: { userId: { $ne: null } } },
            { $lookup: { from: "roles", localField: "roleId", foreignField: "_id", as: "role" } },
            { $match: { $or: [{ admin: true }, { "role.permissions": "attends" }] } },
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
    ]);
  });
});
