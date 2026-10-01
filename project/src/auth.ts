import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import client from "@/service/_shared/database/mongodb";
import { User } from "@/models/User";
import { verifyCredentials } from "@/service/(auth)/login/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(client),
  // O provider Credentials só funciona com sessão JWT.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Google({
      // Um email = uma conta. Se já existe usuário com o email do Google
      // (ex: cadastrado com senha), o Auth.js recusa com OAuthAccountNotLinked
      // em vez de criar outra conta ou vincular sem prova de posse.
      // O caminho inverso (cadastro com email de conta Google) é barrado por
      // registerUser (email_taken) e pelo índice único de users.email.
      allowDangerousEmailAccountLinking: false,
    }),
    Credentials({
      credentials: {
        email: { type: "email", label: "Email" },
        password: { type: "password", label: "Senha" },
      },
      authorize: (credentials) =>
        verifyCredentials(credentials, async (email) => {
          const user = await User.findOne({ email }).select("+passwordHash").lean();
          if (!user) return null;
          return {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            image: user.image,
            passwordHash: user.passwordHash,
          };
        }),
    }),
  ],
  callbacks: {
    // Usado pelo proxy: false manda para pages.signIn com ?callbackUrl=.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      // Landing pública (inclui o POST da server action do formulário de contato).
      if (["/", "/terms"].includes(nextUrl.pathname)) return true;
      if (["/login", "/signup"].includes(nextUrl.pathname)) {
        return isLoggedIn ? Response.redirect(new URL("/workspace", nextUrl)) : true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
