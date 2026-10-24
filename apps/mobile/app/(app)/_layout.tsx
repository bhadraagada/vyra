import { useAuth } from "@clerk/expo"
import { Redirect, Stack } from "expo-router"
import { useEffect } from "react"
import { View } from "react-native"
import { flush } from "../../src/recording/outbox"

/** Everything behind sign-in. Recording itself does not need sign-in. Uploads wait until there is a session. */
export default function AppLayout() {
  const { isLoaded, isSignedIn } = useAuth()
  useEffect(() => {
    if (isSignedIn) void flush(true)
  }, [isSignedIn])

  if (!isLoaded) return <View className="flex-1 bg-black" />
  if (!isSignedIn) return <Redirect href="/sign-in" />
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: "#000" },
        headerStyle: { backgroundColor: "#000" },
        headerTintColor: "#fff",
        headerBackButtonDisplayMode: "minimal",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="trip/[id]" options={{ title: "Trip" }} />
      <Stack.Screen name="vehicle/[id]" options={{ title: "Vehicle" }} />
    </Stack>
  )
}
