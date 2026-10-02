// Migração única: grupos de despesa passam a ter dono unidade ou carteira. O índice único de nome
// por unidade (unitId_1_name_1) vira parcial, só para grupos de unidade, e entra o de carteira.
// O Mongo não troca as opções de um índice existente, então o antigo sai antes.
//
//   npm run migrate:expense-group-owners
//
// Usa o MONGODB_URI do ambiente (ex.: o de produção, passado no terminal) ou, sem ele, o do
// .env.local. Pode rodar mais de uma vez: o índice só é recriado se ainda não for parcial. Rode
// antes de publicar a versão com grupos de carteira.

import { existsSync } from "node:fs"
import path from "node:path"
import { MongoClient } from "mongodb"

const PT_COLLATION = { locale: "pt", strength: 1 }

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
    const groups = client.db().collection("expense_groups")
    const indexes = await groups.indexes()

    const unitIndex = indexes.find((index) => index.name === "unitId_1_name_1")
    if (unitIndex && !unitIndex.partialFilterExpression) {
      await groups.dropIndex("unitId_1_name_1")
      console.log("Índice antigo unitId_1_name_1 removido")
    }
    if (!unitIndex?.partialFilterExpression) {
      await groups.createIndex(
        { unitId: 1, name: 1 },
        { unique: true, collation: PT_COLLATION, partialFilterExpression: { unitId: { $type: "objectId" } } },
      )
      console.log("Índice unitId_1_name_1 criado (parcial)")
    }
    if (!indexes.some((index) => index.name === "walletId_1_name_1")) {
      await groups.createIndex(
        { walletId: 1, name: 1 },
        { unique: true, collation: PT_COLLATION, partialFilterExpression: { walletId: { $type: "objectId" } } },
      )
      console.log("Índice walletId_1_name_1 criado")
    }
    console.log("Pronto")
  } finally {
    await client.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
