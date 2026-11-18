export { auth as middleware } from "@/auth"

// Signed-out visitors are sent to sign in, except for the API, the connector's
// OAuth pages and metadata (they handle sign-in themselves), and the privacy policy.
export const config = {
  matcher: ["/((?!api|oauth|\\.well-known|privacy|_next/static|_next/image|favicon.ico).*)"],
}
