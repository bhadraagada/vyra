import "../global.css"
import "../src/recording/background"
import { ClerkProvider, useAuth } from "@clerk/expo"
import { tokenCache } from "@clerk/expo/token-cache"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { useEffect } from "react"
import { Text, View } from "react-native"
import { clerkKey, convexUrl, isConfigured } from "../src/env"
import { setAccount } from "../src/recording/outbox"

const convex = isConfigured ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false }) : null

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      {convex ? (
        <ClerkProvider publishableKey={clerkKey} tokenCache={tokenCache}>
          <AccountSync />
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#000" } }} />
          </ConvexProviderWithClerk>
        </ClerkProvider>
      ) : (
        <NotConfigured />
      )}
    </>
  )
}

/** Copies the Clerk user into SQLite, so a trip started in the background gets the right owner. */
function AccountSync() {
  const { isLoaded, userId } = useAuth()
  useEffect(() => {
    if (isLoaded) void setAccount(userId ?? null).catch((e: unknown) => console.warn("account sync failed", e))
  }, [isLoaded, userId])
  return null
}

function NotConfigured() {
  return (
    <View className="flex-1 justify-center gap-3 bg-black px-6">
      <Text className="text-2xl font-semibold text-white">VYRA is not configured</Text>
      <Text className="text-base text-white">
        Set EXPO_PUBLIC_CONVEX_URL and EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in apps/mobile/.env, then rebuild the app.
      </Text>
    </View>
  )
}
