import { handleDevSession, configFromEnv } from '@/lib/native/handlers'
import { defaultUserStore } from '@/lib/native/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handleDevSession(req, { config: configFromEnv(), users: defaultUserStore() })
}
