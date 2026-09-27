import NextAuth, { type NextAuthOptions, type Session } from "next-auth";
import type { JWT } from "next-auth/jwt";

type AuthToken = JWT & { role?: string };
type AuthSession = Session & { user?: Session["user"] & { role?: string } };

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies: false,
  providers: [],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt" as const,
  },
  callbacks: {
    async jwt({ token, user }) {
      const authToken = token as AuthToken;
      const authUser = user as { role?: string } | undefined;
      if (authUser) {
        authToken.role = authUser.role ?? "CUSTOMER";
      }
      return authToken;
    },
    async session({ session, token }) {
      const authSession = session as AuthSession;
      const authToken = token as AuthToken;
      if (authSession.user) {
        authSession.user.role = authToken.role ?? "CUSTOMER";
      }
      return authSession;
    },
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
