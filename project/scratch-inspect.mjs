import { MongoClient } from "mongodb";
import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim().replace(/^"|"$/g,"")]));
const c = new MongoClient(env.MONGODB_URI); await c.connect();
const db = c.db();
const units = await db.collection("units").find({ name: /viale/i }).toArray();
console.log(JSON.stringify(units,null,1));
for (const u of units) {
  const ws = await db.collection("workspaces").findOne({ _id: u.workspaceId });
  console.log("WS", ws.name, ws.userId, (await db.collection("users").findOne({_id: ws.userId}))?.name);
  const mem = await db.collection("workspace_members").find({ workspaceId: u.workspaceId }).toArray();
  for (const m of mem) console.log("MEM", m.email, m.role, m.userId, JSON.stringify(m.units));
  for (const col of ["services","products","bookings","appointments","expenses","expense_groups"]) console.log(col, await db.collection(col).countDocuments({ unitId: u._id }));
  console.log(JSON.stringify(await db.collection("services").find({unitId:u._id}).toArray()));
  console.log(JSON.stringify(await db.collection("products").find({unitId:u._id}).toArray()));
  console.log(JSON.stringify(await db.collection("expense_groups").find({unitId:u._id}).toArray()));
  console.log(JSON.stringify(await db.collection("expenses").find({unitId:u._id}).limit(3).toArray()));
  console.log(JSON.stringify(await db.collection("appointments").find({unitId:u._id}).limit(2).toArray()));
  console.log(JSON.stringify(await db.collection("bookings").find({unitId:u._id}).limit(2).toArray()));
}
console.log("icons", JSON.stringify(await db.collection("expense_group_icons").find().toArray()));
await c.close();
