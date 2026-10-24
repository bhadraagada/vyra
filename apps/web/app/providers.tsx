"use client"

import { useAuth } from "@clerk/nextjs"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import type { ReactNode } from "react"

const url = process.env.NEXT_PUBLIC_CONVEX_URL
const convex = url ? new ConvexReactClient(url) : null

/** Gives every page a Convex client that sends the Clerk token. */
export function Providers({ children }: { children: ReactNode }) {
  if (!convex) return <p className="p-4 text-sm">NEXT_PUBLIC_CONVEX_URL is not set.</p>
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  )
}
