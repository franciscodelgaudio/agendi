// Migração única: o dono do workspace (Workspace.userId) deixou de ter acesso implícito e
// passa a ser um membro administrador em workspace_members.
//
//   npm run migrate:owners
//
// Lê o MONGODB_URI do .env.local. Pode rodar mais de uma vez: quem já é membro do
// workspace só vira administrador; quem não é ganha o documento. Os demais membros
// (antigos massagistas e recepcionistas) ficam sem role até um administrador definir uma,
// e o campo role antigo e Workspace.hiddenPages são removidos.

import path from "node:path"
import { MongoClient } from "mongodb"

async function main() {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"))
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error("MONGODB_URI ausente no .env.local")

  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db()
    const workspaces = db.collection("workspaces")
    const members = db.collection("workspace_members")
    const users = db.collection("users")

    let created = 0
    let promoted = 0
    for await (const workspace of workspaces.find({}, { projection: { userId: 1 } })) {
      const user = await users.findOne({ _id: workspace.userId }, { projection: { email: 1 } })
      if (!user?.email) {
        console.warn(`Workspace ${workspace._id}: dono ${workspace.userId} sem email, ignorado`)
        continue
      }
      const email = String(user.email).toLowerCase()
      const now = new Date()
      const result = await members.updateOne(
        { workspaceId: workspace._id, email },
        {
          $set: {
            admin: true,
            roleId: null,
            userId: workspace.userId,
            updatedAt: now,
          },
          $unset: { tokenHash: "", expiresAt: "" },
          $setOnInsert: { units: [], acceptedAt: now, createdAt: now },
        },
        { upsert: true },
      )
      if (result.upsertedCount) created++
      else if (result.modifiedCount) promoted++
    }

    const withoutRole = await members.countDocuments({
      role: { $exists: true },
      admin: { $ne: true },
    })
    await members.updateMany({ role: { $exists: true } }, [
      {
        $set: {
          admin: { $ifNull: ["$admin", false] },
          roleId: { $ifNull: ["$roleId", null] },
        },
      },
      { $unset: "role" },
    ])
    await workspaces.updateMany({ hiddenPages: { $exists: true } }, { $unset: { hiddenPages: "" } })

    console.log(
      `Administradores criados: ${created}; membros promovidos: ${promoted}; membros sem role: ${withoutRole}`,
    )
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
