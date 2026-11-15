import type { Metadata } from 'next'

// Plain privacy policy. The Claude and ChatGPT directories ask for one, and the
// iPhone app links here from Settings.

export const metadata: Metadata = { title: 'Privacy policy · Gym' }

const UPDATED = '14 November 2026'
// Set NEXT_PUBLIC_PRIVACY_CONTACT to the email people should write to.
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_PRIVACY_CONTACT
const CONTACT_HREF = CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : 'https://github.com/timofeic/gym/issues'
const CONTACT = CONTACT_EMAIL ?? 'the Gym project page'

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 px-4 py-12 text-[15px] leading-relaxed">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Privacy policy</h1>
        <p className="text-sm text-gray-500">Last updated {UPDATED}</p>
      </header>

      <p>
        Gym is a small workout log made by one person. This page says what it stores, who can see it, and how to delete
        it. It covers the website, the iPhone app, the voice coach and the Gym connector for Claude and ChatGPT.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What we store</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your account: the name, email address and profile picture from Google or Apple when you sign in.</li>
          <li>Your workouts: dates, exercises, sets, reps and weights.</li>
          <li>Your exercises and any changes you make to the built-in ones.</li>
          <li>Categories (like Chest or Legs). Categories are shared by everyone who uses Gym, so don’t put anything personal in a category name.</li>
          <li>
            Connected apps: when you connect Claude or ChatGPT, we keep the app’s name, when you connected it, when it was
            last used, and your timezone (so “last Monday” means your Monday). Access keys are stored scrambled (hashed),
            never in plain text.
          </li>
        </ul>
        <p>We don’t sell your data, show ads, or use it to train AI models. We don’t use tracking cookies; the only cookies keep you signed in.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Who can see it</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>You. Every request runs as you, and the database only returns your own workouts and exercises.</li>
          <li>The apps you connect. If you connect Claude or ChatGPT, they can read and add to your gym data while connected. What they do with it is covered by their own privacy policies (Anthropic and OpenAI).</li>
          <li>The services Gym runs on: Vercel (hosting), Supabase (database), Google and Apple (sign-in), and, only if you use the in-app voice coach, LiveKit (voice) and Anthropic (the coach’s replies).</li>
          <li>The person who runs Gym can see the database to fix problems, and won’t look at your data otherwise.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What the Claude and ChatGPT connector can do</h2>
        <p>
          It can read your workouts, exercises and categories, log new workouts, add exercises and categories, and edit your
          exercises. It can’t delete anything and can’t see other people’s data. Your conversations with Claude or ChatGPT
          stay with them; Gym only sees the requests the assistant makes to it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">How to delete it</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Disconnect an app: in the Gym iPhone app go to Settings, Connected apps, or remove the connector in Claude or ChatGPT. It stops working straight away.</li>
          <li>Delete a workout or exercise: swipe it in the app, or use the website.</li>
          <li>Delete everything: contact <a className="underline" href={CONTACT_HREF}>{CONTACT}</a> from the address you sign in with. We delete your account and all your workouts within 30 days.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Questions</h2>
        <p>Contact <a className="underline" href={CONTACT_HREF}>{CONTACT}</a>. If this policy changes, the date at the top changes too.</p>
      </section>
    </article>
  )
}
