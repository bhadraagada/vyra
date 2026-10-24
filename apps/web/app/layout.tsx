import { ClerkProvider } from "@clerk/nextjs"
import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Providers } from "./providers"
import "./globals.css"

export const metadata: Metadata = { title: "VYRA" }

const appearance = {
  variables: {
    colorBackground: "#000",
    colorForeground: "#fff",
    colorPrimary: "#fff",
    colorPrimaryForeground: "#000",
    colorInput: "#111",
    colorInputForeground: "#fff",
    colorNeutral: "#fff",
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white antialiased">
        <ClerkProvider signInUrl="/sign-in" appearance={appearance}>
          <Providers>{children}</Providers>
        </ClerkProvider>
      </body>
    </html>
  )
}
