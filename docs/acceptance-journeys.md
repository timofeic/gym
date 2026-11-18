# Acceptance journeys

What a person should be able to do. Builders use this as the definition of
done. The evaluator tests these in the native app (simulator or TestFlight
build) without reading the code. Each journey says what the person does and
what they should see. Weights are kilograms.

## A. Getting in

- **A1 Google sign-in.** On a fresh install, tap "Sign in with Google", pick an
  account that already uses the web app. Land on Overview showing that
  person's existing workouts (same as the website).
- **A2 Sign in with Apple.** On a fresh install, tap "Sign in with Apple".
  Land on Overview. If Apple shares an email that matches an existing web
  account, see that account's workouts; otherwise an empty new account.
- **A3 Stay signed in.** Close and reopen the app: still signed in.
- **A4 Sign out.** Settings > Sign out returns to the sign-in screen; reopening
  the app stays signed out.

## B. Workouts

- **B1 Log.** Overview > Log workout > add two exercises > change sets, reps
  and weight > Save. The workout appears at the top of Recent workouts with
  those numbers; the week chart and sets-per-muscle update.
- **B2 Limits.** Weight can't go above 500 or below 0; sets 1 to 10; reps 1 to 100.
- **B3 Repeat.** Swipe a past workout > Repeat > Save: a copy dated now.
- **B4 Edit.** Tap a workout, change the date and a weight, Save: the change shows.
- **B5 Delete.** Swipe > Delete > confirm: it's gone, charts update.
- **B6 Same data on the web.** A workout logged on the phone shows on the
  website, and the other way round.

## C. Exercises and categories

- **C1 Add.** Exercises > + > name, defaults, categories > Save: it appears, marked "Yours".
- **C2 Duplicate name.** Adding "  bench   PRESS" when "Bench Press" exists shows
  a clear message under the name and doesn't save.
- **C3 Edit a built-in.** Editing a built-in exercise saves a personal copy
  marked "Edited"; swipe > Reset brings the original back.
- **C4 Can't delete used exercises.** Deleting an exercise that's in a past
  workout explains why it can't.
- **C5 Categories.** Settings: add, rename and delete a category; exercises
  using it update to match.

## D. Progress

- **D1 Charts.** Progress shows weight and reps over time for exercises done at
  least N times; search and category chips filter the list.

## E. Voice in their own Claude or ChatGPT (no bill for us)

- **E1 Connect Claude.** In the Claude app or claude.ai, add the gym connector
  URL, sign in to gym through the connector's sign-in page, approve.
- **E2 Ask.** In Claude (typed, then voice mode on iPhone): "What did I do last
  Monday?", "How's my bench going?", "How many leg sets this week?" Answers
  match the app.
- **E3 Log by voice.** "Log bench, 3 sets of 8 at 80." Claude confirms, saves;
  it appears in the phone app after pull-to-refresh.
- **E4 Only my data.** A second account connected to Claude sees only its own workouts.
- **E5 ChatGPT.** The same connector works in ChatGPT (developer mode or app),
  at least for typed questions and logging.
- **E6 Disconnect.** Revoking access (in Claude or in the gym app's Settings)
  stops further reads.

## F. In-app coach and Siri

- **F1 Coach is off by default.** The Coach tab explains the Claude/ChatGPT
  option and how to connect. The LiveKit coach can be turned on in Settings.
- **F2 LiveKit coach (when on).** Start talking: the coach greets you; "log
  squats 5 by 5 at 100" is read back, saved after "yes", and shows on Overview
  without a refresh. "Start a 90 second rest" shows a countdown and the coach
  speaks when it ends. End hangs up.
- **F3 Siri.** "Hey Siri, log a set in Gym" (or the Shortcuts app equivalent)
  and "Start a rest timer in Gym" work without opening the app first.
- **F4 Rest timer.** Starting a rest in the app keeps counting with the app in
  the background and notifies when done.

## G. Shipping

- **G1 TestFlight.** A build installs from TestFlight on an iPhone, opens on
  the sign-in screen, and talks to production (not localhost).
- **G2 Privacy.** The app asks for the microphone only when the LiveKit coach
  starts, with a clear reason. A privacy policy link is in Settings.
