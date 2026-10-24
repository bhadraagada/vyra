import { useClerk, useUser } from "@clerk/expo"
import { api } from "@vyra/backend/convex/_generated/api"
import { useQuery } from "convex/react"
import { useState } from "react"
import { Alert, ScrollView, Switch, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as motion from "../../../modules/vyra-motion"
import { requestLocation } from "../../../src/permissions"
import { outboxCount } from "../../../src/recording/db"
import { useLocal } from "../../../src/recording/events"
import { flush } from "../../../src/recording/outbox"
import { Button, Heading } from "../../../src/ui"

const STOP_URL = "vyra://stop?reason=disconnect"

/** Settings tab: drive detection, Shortcuts setup, pending uploads and sign out. */
export default function Settings() {
  const { signOut } = useClerk()
  const { user } = useUser()
  const vehicles = useQuery(api.vehicles.list)
  const pending = useLocal(outboxCount)
  const [autoStart, setAutoStart] = useState(motion.isAutoStartEnabled)
  const [note, setNote] = useState<string | null>(null)
  const keys = vehicles?.filter((v) => !v.archived).map((v) => v.triggerKey) ?? []

  async function toggleAutoStart(on: boolean) {
    setNote(null)
    if (on && (await requestLocation()) !== "always") {
      setNote("Drive detection needs location access set to Always.")
      return
    }
    motion.setAutoStartEnabled(on)
    setAutoStart(motion.isAutoStartEnabled())
  }

  function confirmSignOut() {
    if (!pending) return void signOut()
    Alert.alert("Uploads waiting", `${pending} uploads stay on this phone. They upload when you sign in to this account again.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ])
  }

  return (
    <SafeAreaView className="flex-1 bg-black" edges={["top"]}>
      <ScrollView contentContainerClassName="px-5 pb-12">
        <Text className="pt-4 pb-2 text-3xl font-semibold text-white">Settings</Text>

        <View className="flex-row items-center justify-between py-2">
          <Text className="flex-1 text-base text-white">Start trips when a drive is detected</Text>
          <Switch value={autoStart} disabled={!motion.isAvailable()} onValueChange={(on) => void toggleAutoStart(on)} />
        </View>
        {!motion.isAvailable() && <Text className="text-sm text-white">Drive detection is not available on this device.</Text>}
        {note && <Text className="text-sm text-red-500">{note}</Text>}

        <Heading>Start and stop with your car</Heading>
        <View className="gap-2">
          <Step n={1}>Open the Shortcuts app, go to Automation and tap New Automation.</Step>
          <Step n={2}>Pick CarPlay and choose Connects. For a car without CarPlay, pick Bluetooth, choose the car and Is Connected.</Step>
          <Step n={3}>Pick Run Immediately. Add the action Open URLs with this URL:</Step>
          {(keys.length ? keys : ["<trigger key>"]).map((key) => (
            <Url key={key} value={`vyra://start?vehicle=${key}`} />
          ))}
          <Step n={4}>Make a second automation with CarPlay Disconnects, or Bluetooth Is Disconnected, and this URL:</Step>
          <Url value={STOP_URL} />
          <Text className="text-sm text-white">
            Use one start automation per car, with that car's trigger key. While the car is connected, standing still does not end the trip.
          </Text>
        </View>

        <Heading>Uploads</Heading>
        <Text className="pb-3 text-base text-white">
          {pending === undefined ? " " : pending === 0 ? "Everything is uploaded." : `${pending} uploads waiting.`}
        </Text>
        <Button title="Upload now" disabled={!pending} onPress={() => void flush(true)} />

        <Heading>Account</Heading>
        <Text className="pb-3 text-base text-white">{user?.primaryEmailAddress?.emailAddress}</Text>
        <Button title="Sign out" tone="danger" onPress={confirmSignOut} />
      </ScrollView>
    </SafeAreaView>
  )
}

const Step = ({ n, children }: { n: number; children: string }) => (
  <Text className="text-base text-white">
    {n}. {children}
  </Text>
)

const Url = ({ value }: { value: string }) => (
  <Text selectable className="py-1 font-mono text-base text-white">
    {value}
  </Text>
)
