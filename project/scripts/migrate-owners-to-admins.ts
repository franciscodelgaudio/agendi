// Migração única: o dono do workspace (Workspace.userId) deixou de ter acesso implícito e
// passa a ser um membro administrador em workspace_members.
//
//   npm run migrate:owners
//
// Usa o MONGODB_URI do ambiente (ex.: o de produção, passado no terminal) ou, sem ele, o do
// .env.local. Pode rodar mais de uma vez: quem já é membro do workspace só vira
// administrador; quem não é ganha o documento. Os demais membros (antigos profissionais e
// recepcionistas) ficam sem role até um administrador definir uma, e o campo role antigo e
// Workspace.hiddenPages são removidos.

import { existsSync } from "node:fs"
import path from "node:path"
import { MongoClient } from "mongodb"

async function main() {
  const envFile = path.join(process.cwd(), ".env.local")
  if (!process.env.MONGODB_URI && existsSync(envFile)) process.loadEnvFile(envFile)
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error("MONGODB_URI ausente (no ambiente ou no .env.local)")
  // Mostra o banco para conferir, sem a senha.
  console.log(`Banco: ${uri.replace(/\/\/[^@/]*@/, "//***@").split("?")[0]}`)

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
      // Já migrado (rodada anterior): nada a fazer.
      const migrated = { workspaceId: workspace._id, email, admin: true, userId: workspace.userId }
      if (await members.countDocuments(migrated, { limit: 1 })) continue
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
