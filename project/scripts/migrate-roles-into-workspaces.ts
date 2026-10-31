import { existsSync } from "node:fs"
import path from "node:path"
import { MongoClient, ObjectId } from "mongodb"
import { ADMIN_ROLE_NAME } from "../src/service/workspace/[workspaceId]/users/permissions/permissions"

type Role = { _id: ObjectId; admin?: boolean }

async function main() {
  const envFile = path.join(process.cwd(), ".env.local")
  if (!process.env.MONGODB_URI && existsSync(envFile)) process.loadEnvFile(envFile)
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error("MONGODB_URI ausente (no ambiente ou no .env.local)")
  console.log(`Banco: ${uri.replace(/\/\/[^@/]*@/, "//***@").split("?")[0]}`)

  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db()
    const workspaces = db.collection<{ roles?: (Role & Record<string, unknown>)[] }>("workspaces")
    const members = db.collection("workspace_members")

    let rolesCreated = 0
    let membersLinked = 0
    let membersWithoutRole = 0
    for await (const workspace of workspaces.find({}, { projection: { roles: 1 } })) {
      const roles: Role[] = workspace.roles ?? []
      let adminRole = roles.find((role) => role.admin)
      if (!adminRole) {
        adminRole = { _id: new ObjectId(), admin: true }
        await workspaces.updateOne(
          { _id: workspace._id },
          {
            $push: {
              roles: { _id: adminRole._id, name: ADMIN_ROLE_NAME, admin: true, permissions: [], pages: { workspace: [], unit: [] } },
            },
          },
        )
        rolesCreated++
      }

      const roleIds = roles.map((role) => role._id)
      const linked = await members.updateMany(
        { workspaceId: workspace._id, admin: true, roleId: { $nin: [...roleIds, adminRole._id] } },
        { $set: { roleId: adminRole._id, updatedAt: new Date() } },
      )
      membersLinked += linked.modifiedCount

      membersWithoutRole += await members.countDocuments({
        workspaceId: workspace._id,
        roleId: { $nin: [...roleIds, adminRole._id] },
      })
    }

    console.log(
      `Roles de administrador criadas: ${rolesCreated}; membros ligados à role: ${membersLinked}; membros ainda sem role válida: ${membersWithoutRole}`,
    )
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
