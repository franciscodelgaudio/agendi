import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { connectOnUse } from "@/lib/mongoose";

// Mesma coleção "users" usada pelo @auth/mongodb-adapter. Os campos
// name/email/image/emailVerified são os que o adapter grava; passwordHash
// só existe para contas de email + senha.
const userSchema = new Schema(
  {
    name: String,
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    image: String,
    emailVerified: Date,
    passwordHash: { type: String, select: false },
    // Quando o usuário concluiu ou dispensou o tutorial; sem o campo, o tutorial abre sozinho.
    tutorialCompletedAt: Date,
  },
  { collection: "users" },
);

userSchema.plugin(connectOnUse);

export type UserDoc = InferSchemaType<typeof userSchema>;

export const User: Model<UserDoc> = models.User ?? model<UserDoc>("User", userSchema);
