import { api } from "@vyra/backend/convex/_generated/api"
import { useQuery } from "convex/react"
import { useFocusEffect } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { Linking, ScrollView, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { duration, km, kmh, time } from "../../../src/format"
import { locationAccess, requestLocation, type LocationAccess } from "../../../src/permissions"
import { liveSnapshot, startTrip, stopTrip } from "../../../src/recording/engine"
import { useLocal } from "../../../src/recording/events"
import { Button, Stat } from "../../../src/ui"

/** Record tab: start and stop, live speed, distance, elapsed time and vehicle. */
export default function Record() {
  const live = useLocal(liveSnapshot)
  const vehicles = useQuery(api.vehicles.list)
  const access = useAccess()
  const now = useNow(live?.state.kind === "recording")

  if (!live) return <View className="flex-1 bg-black" />
  const { state, stats, speedMps } = live
  const recording = state.kind === "recording"
  const active = vehicles?.filter((v) => !v.archived)
  const vehicle = recording
    ? (active?.find((v) => v.triggerKey === state.vehicleKey) ?? active?.find((v) => v.isDefault))
    : active?.find((v) => v.isDefault)

  return (
    <SafeAreaView className="flex-1 bg-black" edges={["top"]}>
      <ScrollView contentContainerClassName="gap-6 px-5 pb-10 pt-4">
        <View>
          <Text className="text-[96px] font-bold leading-[104px] text-white" style={{ fontVariant: ["tabular-nums"] }}>
            {recording && speedMps !== null ? Math.round(speedMps * 3.6) : 0}
          </Text>
          <Text className="text-base text-white">km/h</Text>
        </View>

        <View>
          <Stat label="Status" value={recording ? `Recording since ${time(state.startedAt)}` : "Not recording"} />
          <Stat label="Distance" value={km(recording ? stats.distanceM : 0)} />
          <Stat label="Elapsed" value={duration(recording ? (now - state.startedAt) / 1000 : 0)} />
          <Stat label="Avg moving speed" value={kmh(recording ? stats.avgSpeedMps : 0)} />
          <Stat label="Vehicle" value={vehicle?.name ?? (recording ? state.vehicleKey : null) ?? "None"} />
          {recording && <Stat label="Started by" value={sourceText[state.source]} />}
        </View>

        {recording ? (
          <Button title="Stop trip" tone="danger" onPress={() => void stopTrip("manual")} />
        ) : (
          <Button
            title="Start trip"
            tone="primary"
            disabled={access.value === "denied"}
            onPress={() => void requestLocation().then(access.refresh).then(() => startTrip("manual"))}
          />
        )}

        <AccessNote access={access.value} canAsk={access.canAsk} onAsk={() => void requestLocation().then(access.refresh)} />
      </ScrollView>
    </SafeAreaView>
  )
}

const sourceText = { manual: "Tap", shortcut: "Shortcut", motion: "Drive detection" } as const

/** Explains in plain words why VYRA needs "Always" location, and what to do after a denial. */
function AccessNote({ access, canAsk, onAsk }: { access: LocationAccess | null; canAsk: boolean; onAsk: () => void }) {
  if (access === null || access === "always") return null
  const text =
    access === "denied"
      ? "Location access is off, so VYRA cannot record. Turn it on in Settings > VYRA > Location and pick Always."
      : access === "foreground"
        ? "VYRA can record only while it is open. Pick Always so a trip keeps recording with the screen locked and so drive detection can start trips."
        : "VYRA needs your location to record drives. Pick Always so trips record with the screen locked."
  const settings = access === "denied" || !canAsk
  return (
    <View className="gap-3">
      <Text className="text-base text-white">{text}</Text>
      <Button
        title={settings ? "Open Settings" : "Allow location"}
        onPress={settings ? () => void Linking.openSettings() : onAsk}
      />
    </View>
  )
}

function useAccess() {
  const [value, setValue] = useState<{ access: LocationAccess; canAsk: boolean } | null>(null)
  const refresh = useCallback(() => locationAccess().then(setValue), [])
  // Re-check on focus, because the user can change access in iOS Settings at any time.
  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )
  return { value: value?.access ?? null, canAsk: value?.canAsk ?? true, refresh }
}

/** Current time, updated once per second while `on`. */
function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!on) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [on])
  return now
}
