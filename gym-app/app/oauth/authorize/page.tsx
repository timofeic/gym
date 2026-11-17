import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { appleWebSignIn, signIn } from '@/auth'
import { checkAuthorizeRequest, signConsent } from '@/lib/mcp/oauth'
import { mcpDeps, originFrom } from '@/lib/mcp/config'
import { webUser } from '@/lib/mcp/session'
import { devLoginEmail, devSignIn } from '@/lib/mcp/devlogin'

// The connector's sign-in and consent page. Claude or ChatGPT sends people
// here; they sign in with Google or Apple (the same account as the app), see what the
// connector can do, and approve.

export const dynamic = 'force-dynamic'

const CAN_DO = [
  'Read your workouts, exercises and categories',
  'Log new workouts',
  'Add exercises and categories, and edit your exercises',
]
const CANNOT_DO = ['Delete workouts or exercises', 'See anyone else’s data']

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-950">{children}</div>
    </div>
  )
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') q.set(k, v)

  const h = await headers()
  const origin = originFrom(h)
  const deps = mcpDeps(new Request(`${origin}/oauth/authorize`, { headers: h }))
  const check = await checkAuthorizeRequest(q, deps)
  if (!check.ok && 'redirect' in check) redirect(check.redirect)
  if (!check.ok) {
    return (
      <Card>
        <h1 className="text-xl font-semibold">Can’t connect</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">{check.message}</p>
      </Card>
    )
  }

  const user = await webUser()
  const appName = check.client.client_name
  const returnHost = new URL(check.params.redirect_uri).host

  if (!user) {
    const here = `/oauth/authorize?${q.toString()}`
    const devEmail = devLoginEmail()
    const secure = origin.startsWith('https:')
    return (
      <Card>
        <h1 className="text-xl font-semibold">Connect {appName} to Gym</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Sign in the way you do in the Gym app. Next you’ll see what {appName} will be able to do.
        </p>
        {appleWebSignIn && (
          <form action={async () => { 'use server'; await signIn('apple', { redirectTo: here }) }}>
            <button type="submit" className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
              Sign in with Apple
            </button>
          </form>
        )}
        <form action={async () => { 'use server'; await signIn('google', { redirectTo: here }) }}>
          <button type="submit" className={appleWebSignIn
            ? 'w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium dark:border-gray-600'
            : 'w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black'}>
            Sign in with Google
          </button>
        </form>
        {devEmail && (
          <form action={async () => { 'use server'; await devSignIn(secure); redirect(here) }}>
            <button type="submit" className="w-full rounded-md border border-dashed border-gray-400 px-4 py-2 text-sm">
              Continue as {devEmail} (local test only)
            </button>
          </form>
        )}
      </Card>
    )
  }

  const consent = signConsent(check.params, user.id, deps.config.formSecret, Math.floor(Date.now() / 1000) + 15 * 60)
  return (
    <Card>
      <h1 className="text-xl font-semibold">Allow {appName} to use your gym data?</h1>
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Signed in as <strong>{user.email ?? user.name}</strong>. After you allow it, you’ll go back to <strong>{returnHost}</strong>.
      </p>
      <div>
        <p className="text-sm font-medium">{appName} will be able to:</p>
        <ul className="mt-1 list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">{CAN_DO.map(x => <li key={x}>{x}</li>)}</ul>
      </div>
      <div>
        <p className="text-sm font-medium">It can’t:</p>
        <ul className="mt-1 list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">{CANNOT_DO.map(x => <li key={x}>{x}</li>)}</ul>
      </div>
      <p className="text-xs text-gray-500">
        You can disconnect any time in {appName}, or in the Gym iPhone app under Settings. Read the{' '}
        <a className="underline" href="/privacy">privacy policy</a>.
      </p>
      <form method="post" action="/oauth/authorize/decision" className="flex gap-3">
        <input type="hidden" name="consent" value={consent} />
        <input type="hidden" name="timezone" id="tz" defaultValue="UTC" />
        <button name="decision" value="deny" className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm dark:border-gray-700">Cancel</button>
        <button name="decision" value="allow" className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">Allow</button>
      </form>
      <script dangerouslySetInnerHTML={{ __html: "try{document.getElementById('tz').value=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch(e){}" }} />
    </Card>
  )
}
