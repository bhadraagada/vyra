import { clerkMiddleware } from "@clerk/nextjs/server"

// Sets up the Clerk session only. Access is checked in app/(app)/layout.tsx and by every Convex function.
export default clerkMiddleware()

export const config = {
  matcher: [
    "/((?!_next|[^?]*\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
