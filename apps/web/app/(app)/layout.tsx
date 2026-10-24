"use client"

import { RedirectToSignIn, Show, UserButton } from "@clerk/nextjs"
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

const links = [
  ["/", "Dashboard"],
  ["/trips", "Trips"],
  ["/routes", "Routes"],
  ["/garage", "Garage"],
] as const

/**
 * Nav for every private page. Signed-out users go to sign-in. Pages render only after Convex accepts
 * the Clerk token, and every Convex function checks the owner again.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const path = usePathname()
  return (
    <div className="mx-auto max-w-6xl px-4 py-3">
      <nav className="flex items-center gap-5 border-b border-neutral-800 pb-2 text-sm">
        <span className="font-semibold tracking-widest">VYRA</span>
        {links.map(([href, label]) => {
          const active = href === "/" ? path === "/" : path.startsWith(href)
          return (
            <Link key={href} href={href} className={active ? "text-white" : "text-neutral-500 hover:text-white"}>
              {label}
            </Link>
          )
        })}
        <span className="ml-auto flex">
          <UserButton />
        </span>
      </nav>
      <AuthLoading>
        <p className="py-4 text-sm">Loading</p>
      </AuthLoading>
      <Unauthenticated>
        <Show when="signed-out">
          <RedirectToSignIn />
        </Show>
        <Show when="signed-in">
          <p className="py-4 text-sm">Convex did not accept the session. Check the Clerk JWT template named convex.</p>
        </Show>
      </Unauthenticated>
      <Authenticated>
        <main className="pb-12">{children}</main>
      </Authenticated>
    </div>
  )
}
