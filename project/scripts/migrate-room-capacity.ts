// Migração única (ADR-036): o número de atendimentos simultâneos da sala passou de
// treatmentRooms[].beds para treatmentRooms[].capacity.
//
//   npm run migrate:room-capacity
//
// Rode ANTES de publicar a versão que lê capacity. Copia beds para capacity e mantém beds,
// para a versão anterior continuar funcionando até o deploy. Pode rodar mais de uma vez:
// sala que já tem capacity não muda.
//
// Lê o MONGODB_URI do .env.local.

import path from "node:path"
import { MongoClient } from "mongodb"

async function main() {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"))
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error("MONGODB_URI ausente no .env.local")

  const client = new MongoClient(uri)
  try {
    await client.connect()
    const units = client.db().collection("units")

    const { matchedCount, modifiedCount } = await units.updateMany(
      { treatmentRooms: { $elemMatch: { capacity: { $exists: false }, beds: { $exists: true } } } },
      [
        {
          $set: {
            treatmentRooms: {
              $map: {
                input: "$treatmentRooms",
                as: "room",
                in: { $mergeObjects: ["$$room", { capacity: { $ifNull: ["$$room.capacity", "$$room.beds"] } }] },
              },
            },
          },
        },
      ],
    )

    console.log(`Unidades com salas sem capacity: ${matchedCount}; atualizadas: ${modifiedCount}`)
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
