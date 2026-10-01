import { MongoClient } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI não definido no ambiente");
}

const uri = process.env.MONGODB_URI;

const globalForMongo = globalThis as unknown as {
  _mongoClient?: MongoClient;
};

// Em dev o HMR recarrega módulos; reaproveita o client para não abrir
// uma conexão nova a cada reload.
const client = globalForMongo._mongoClient ?? new MongoClient(uri);

if (process.env.NODE_ENV !== "production") {
  globalForMongo._mongoClient = client;
}

export default client;
