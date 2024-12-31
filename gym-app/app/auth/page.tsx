import SignIn from "@/components/sign-in"

export default function AuthPage() {
  return (
    <div className="container mx-auto flex min-h-screen flex-col items-center justify-center">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to Tim&apos;s Workout App
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to track your workouts and exercises
          </p>
        </div>
        <SignIn />
      </div>
    </div>
  )
} 