#!/usr/bin/env node
// Makes AUTH_APPLE_SECRET for Sign in with Apple on the website (Auth.js).
// Apple's "client secret" is a JWT signed with your Sign in with Apple key.
// It lasts at most 6 months, so run this again before it expires.
//
//   node gym-app/scripts/apple-client-secret.mjs <team id> <key id> <path to AuthKey_XXXX.p8> <services id>
//
// Prints the secret only. Put it in Vercel as AUTH_APPLE_SECRET, and the
// Services ID as AUTH_APPLE_ID. See docs/connector.md.
import { readFileSync } from 'node:fs'
import { importPKCS8, SignJWT } from 'jose'

const [teamId, keyId, keyPath, servicesId] = process.argv.slice(2)
if (!teamId || !keyId || !keyPath || !servicesId) {
  console.error('Usage: apple-client-secret.mjs <team id> <key id> <AuthKey.p8> <services id>')
  process.exit(1)
}
const key = await importPKCS8(readFileSync(keyPath, 'utf8'), 'ES256')
const now = Math.floor(Date.now() / 1000)
const secret = await new SignJWT({})
  .setProtectedHeader({ alg: 'ES256', kid: keyId })
  .setIssuer(teamId)
  .setIssuedAt(now)
  .setExpirationTime(now + 180 * 86400)
  .setAudience('https://appleid.apple.com')
  .setSubject(servicesId)
  .sign(key)
console.log(secret)
console.error(`Expires ${new Date((now + 180 * 86400) * 1000).toISOString().slice(0, 10)}. Make a new one before then.`)
