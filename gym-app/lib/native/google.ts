import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

// Checks a Google ID token from the iOS Google Sign-In SDK.

const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

let googleKeys: JWTVerifyGetKey | null = null
function defaultKeys() {
  googleKeys ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))
  return googleKeys
}

export type GoogleIdentity = { email: string; name: string | null; picture: string | null }

export async function verifyGoogleIdToken(
  idToken: string,
  audiences: string[],
  keys: JWTVerifyGetKey = defaultKeys(),
): Promise<GoogleIdentity | null> {
  const allowed = audiences.filter(Boolean)
  if (!idToken || allowed.length === 0) return null
  try {
    const { payload } = await jwtVerify(idToken, keys, {
      issuer: GOOGLE_ISSUERS,
      audience: allowed,
      algorithms: ['RS256'],
    })
    if (typeof payload.email !== 'string' || payload.email_verified !== true) return null
    return {
      email: payload.email.toLowerCase(),
      name: typeof payload.name === 'string' ? payload.name : null,
      picture: typeof payload.picture === 'string' ? payload.picture : null,
    }
  } catch {
    return null
  }
}
