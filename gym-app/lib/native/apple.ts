import { createHash, timingSafeEqual } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

// Checks an identity token from Sign in with Apple on the iPhone.
// https://developer.apple.com/documentation/sign_in_with_apple/sign_in_with_apple_rest_api/verifying_a_user

export const APPLE_ISSUER = 'https://appleid.apple.com'
export const APPLE_PRIVATE_RELAY_DOMAIN = 'privaterelay.appleid.com'

let appleKeys: JWTVerifyGetKey | null = null
function defaultKeys() {
  appleKeys ??= createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))
  return appleKeys
}

export type AppleIdentity = {
  /** Apple's stable id for this person in our team. Always present. */
  sub: string
  /** Lower case. Null when Apple left it out or didn't mark it verified. */
  email: string | null
  /** True for @privaterelay.appleid.com addresses ("Hide My Email"). */
  isPrivateRelay: boolean
}

// Apple sends some booleans as the strings "true" / "false".
const truthy = (v: unknown) => v === true || v === 'true'

export const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex')

/**
 * Returns the identity if the token is a real, unexpired Apple token for one
 * of `audiences`. When the token carries a nonce, `rawNonce` must hash to it,
 * so a token lifted from another sign-in can't be replayed here.
 */
export async function verifyAppleIdToken(
  identityToken: string,
  audiences: string[],
  rawNonce: string | null,
  keys: JWTVerifyGetKey = defaultKeys(),
): Promise<AppleIdentity | null> {
  const allowed = audiences.filter(Boolean)
  if (!identityToken || allowed.length === 0) return null
  try {
    const { payload } = await jwtVerify(identityToken, keys, {
      issuer: APPLE_ISSUER,
      audience: allowed,
      algorithms: ['RS256'],
    })
    if (typeof payload.sub !== 'string' || !payload.sub) return null

    if (payload.nonce !== undefined) {
      if (typeof payload.nonce !== 'string' || !rawNonce) return null
      const want = Buffer.from(payload.nonce)
      const got = Buffer.from(sha256Hex(rawNonce))
      if (want.length !== got.length || !timingSafeEqual(want, got)) return null
    }

    const email =
      typeof payload.email === 'string' && payload.email && truthy(payload.email_verified)
        ? payload.email.toLowerCase()
        : null
    return {
      sub: payload.sub,
      email,
      isPrivateRelay:
        truthy(payload.is_private_email) || (email?.endsWith(`@${APPLE_PRIVATE_RELAY_DOMAIN}`) ?? false),
    }
  } catch {
    return null
  }
}
