const textEncoder = new TextEncoder()

// Convert string to base64url
function base64UrlEncode(str: string): string {
  const base64 = btoa(str)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Convert ArrayBuffer to base64url
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return base64UrlEncode(binary)
}

interface JWTPayload {
  aud: string
  exp: number
  sub: string
  email: string
  role: string
}

export async function signJWT(payload: JWTPayload, secret: string): Promise<string> {
  // Create JWT header
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  }

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const message = `${encodedHeader}.${encodedPayload}`

  // Convert secret to key
  const keyData = textEncoder.encode(secret)
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  // Sign the message
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(message)
  )

  // Create the final JWT
  return `${message}.${arrayBufferToBase64Url(signature)}`
} 