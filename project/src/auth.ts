import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import client from "@/service/_shared/database/mongodb";
import { User } from "@/models/User";
import { verifyCredentials } from "@/service/(auth)/login/credentials";

declare module "next-auth" {
  interface User {
    avatarUrl?: string | null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(client),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Google({
      allowDangerousEmailAccountLinking: false,
      profile: (profile) => ({
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.picture,
      }),
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
            image: user.avatarUrl,
            passwordHash: user.passwordHash,
          };
        }),
    }),
  ],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      if (["/", "/terms"].includes(nextUrl.pathname)) return true;
      if (["/login", "/signup"].includes(nextUrl.pathname)) {
        return isLoggedIn ? Response.redirect(new URL("/workspace", nextUrl)) : true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.picture = user.avatarUrl ?? user.image ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string;
      return session;
    },
  },
});
