import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import Apple from "next-auth/providers/apple"
import { SupabaseAdapter } from "@auth/supabase-adapter"
import { signJWT } from "@/lib/jwt"

// Sign in with Apple on the web, for people who joined with Apple on the
// iPhone. Off until AUTH_APPLE_ID (the Services ID) and AUTH_APPLE_SECRET
// (scripts/apple-client-secret.mjs) are set. The iPhone app stores Apple
// accounts the same way (provider "apple", Apple's user id), so the same
// person gets the same account. See docs/connector.md.
export const appleWebSignIn = Boolean(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET)

// Apple returns with a cross-site POST (response_mode=form_post), which
// doesn't carry SameSite=Lax cookies. These three have to survive it.
const crossSite = (name: string, maxAge?: number) => ({
  name: `__Secure-authjs.${name}`,
  options: { httpOnly: true, sameSite: "none" as const, path: "/", secure: true, ...(maxAge ? { maxAge } : {}) },
})

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: appleWebSignIn ? [Google, Apple] : [Google],
  ...(appleWebSignIn
    ? { cookies: { state: crossSite("state", 900), nonce: crossSite("nonce", 900), callbackUrl: crossSite("callback-url") } }
    : {}),
  adapter: SupabaseAdapter({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),
  callbacks: {
    async session({ session, user }) {
      const signingSecret = process.env.SUPABASE_JWT_SECRET
      if (signingSecret) {
        const payload = {
          aud: "authenticated",
          exp: Math.floor(new Date(session.expires).getTime() / 1000),
          sub: user.id,
          email: user.email,
          role: "authenticated",
        }
        session.supabaseAccessToken = await signJWT(payload, signingSecret)
      }
      return session
    },
    authorized: async ({ auth }) => {
      return !!auth
    },
  }
})