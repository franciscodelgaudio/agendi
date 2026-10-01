// Migração única: o saldo inicial saiu da unidade (Unit.openingBalance) e passou para as
// carteiras. Cada unidade com saldo vira uma carteira só dela, com o nome da unidade.
//
//   npm run migrate:wallets
//
// Lê o MONGODB_URI do .env.local. Pode rodar mais de uma vez: unidade que já está em uma
// carteira só perde o campo antigo.

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
    const units = db.collection("units")
    const wallets = db.collection("wallets")

    let created = 0
    let skipped = 0
    const withBalance = units.find(
      { openingBalance: { $exists: true } },
      { projection: { name: 1, workspaceId: 1, openingBalance: 1 } },
    )
    for await (const unit of withBalance) {
      if (await wallets.findOne({ "units.unitId": unit._id }, { projection: { _id: 1 } })) {
        skipped++
      } else {
        const now = new Date()
        await wallets.insertOne({
          name: String(unit.name).slice(0, 40),
          openingBalance: { amountCents: unit.openingBalance.amountCents, date: unit.openingBalance.date },
          units: [{ unitId: unit._id, amountCents: null }],
          workspaceId: unit.workspaceId,
          createdAt: now,
          updatedAt: now,
        })
        created++
      }
      await units.updateOne({ _id: unit._id }, { $unset: { openingBalance: "" } })
    }

    console.log(`Carteiras criadas: ${created}; unidades que já tinham carteira: ${skipped}`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
