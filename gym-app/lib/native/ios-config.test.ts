import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// The iPhone app's Google sign-in settings. A wrong or blank id hides the
// Google button or makes Google refuse the sign-in, so check them here.

const configDir = path.resolve(__dirname, '../../../ios/Config')

function settings(file: string) {
  const out: Record<string, string> = {}
  for (const line of readFileSync(path.join(configDir, file), 'utf8').split('\n')) {
    const m = /^([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m) out[m[1]] = m[2]
  }
  return out
}

describe.each(['Release.xcconfig', 'App.xcconfig'])('Google sign-in ids in %s', file => {
  const s = settings(file)

  it('has an iOS client id', () => {
    expect(s.GOOGLE_IOS_CLIENT_ID).toMatch(/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/)
  })

  it('has the URL scheme Google redirects back to (the reversed iOS client id)', () => {
    const id = s.GOOGLE_IOS_CLIENT_ID.replace(/\.apps\.googleusercontent\.com$/, '')
    expect(s.GOOGLE_REVERSED_CLIENT_ID).toBe(`com.googleusercontent.apps.${id}`)
  })

  it('has a web client id from the same Google Cloud project', () => {
    expect(s.GOOGLE_WEB_CLIENT_ID).toMatch(/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/)
    expect(s.GOOGLE_WEB_CLIENT_ID).not.toBe(s.GOOGLE_IOS_CLIENT_ID)
    expect(s.GOOGLE_WEB_CLIENT_ID.split('-')[0]).toBe(s.GOOGLE_IOS_CLIENT_ID.split('-')[0])
  })
})

it('Debug and Release use the same Google clients', () => {
  const debug = settings('App.xcconfig')
  const release = settings('Release.xcconfig')
  for (const key of ['GOOGLE_IOS_CLIENT_ID', 'GOOGLE_WEB_CLIENT_ID', 'GOOGLE_REVERSED_CLIENT_ID']) {
    expect(debug[key], key).toBe(release[key])
  }
})
