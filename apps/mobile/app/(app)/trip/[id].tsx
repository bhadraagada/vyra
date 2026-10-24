import { api } from "@vyra/backend/convex/_generated/api"
import type { Doc, Id } from "@vyra/backend/convex/_generated/dataModel"
import type { GpsPoint } from "@vyra/core"
import { useMutation, useQuery } from "convex/react"
import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Alert, Pressable, ScrollView, Text, View } from "react-native"
import MapView, { Polyline } from "react-native-maps"
import { dateTime, duration, errorText, km, kmh, time } from "../../../src/format"
import { Button, ErrorText, Heading, Stat } from "../../../src/ui"

const stopText = { manual: "Manual stop", disconnect: "Car disconnected", walking: "Walking", idle_timeout: "No movement" } as const

/** Trip detail: route map, stats, delete, change vehicle, merge with the previous trip. */
export default function TripDetail() {
  const tripId = useLocalSearchParams<{ id: string }>().id as Id<"trips">
  const trip = useQuery(api.trips.get, { tripId })
  // Skip once the trip is gone, because points throws "Trip not found" for a deleted trip.
  const points = useQuery(api.trips.points, trip ? { tripId } : "skip")
  const vehicles = useQuery(api.vehicles.list)
  // shortcut: looks for the previous trip in the newest 100 only. Add a backend query if older merges are needed.
  const recent = useQuery(api.trips.list, { paginationOpts: { numItems: 100, cursor: null } })
  const remove = useMutation(api.trips.remove)
  const setVehicle = useMutation(api.trips.setVehicle)
  const merge = useMutation(api.trips.merge)
  const [error, setError] = useState<string | null>(null)

  if (trip === undefined) return <View className="flex-1 bg-black" />
  if (trip === null) return <Text className="flex-1 bg-black p-5 text-base text-white">This trip does not exist.</Text>

  const index = recent?.page.findIndex((t) => t._id === trip._id) ?? -1
  const previous = index >= 0 ? recent?.page[index + 1] : undefined
  const completed = trip.status === "completed"

  const run = (action: () => Promise<unknown>) => {
    setError(null)
    action().catch((e: unknown) => setError(errorText(e)))
  }
  const confirm = (title: string, message: string, label: string, action: () => Promise<unknown>) =>
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: label, style: "destructive", onPress: () => run(action) },
    ])

  return (
    <ScrollView className="flex-1 bg-black" contentContainerClassName="pb-12">
      <RouteMap points={points} />
      <View className="px-5">
        <Text className="pt-4 text-2xl font-semibold text-white">{dateTime(trip.startedAt)}</Text>
        <Stat label="Distance" value={km(trip.distanceM)} />
        <Stat label="Duration" value={duration(trip.durationS)} />
        <Stat label="Moving" value={duration(trip.movingS)} />
        <Stat label="Avg moving speed" value={kmh(trip.avgSpeedMps)} />
        <Stat label="Max speed" value={kmh(trip.maxSpeedMps)} />
        <Stat label="Start" value={time(trip.startedAt)} />
        <Stat label="End" value={trip.endedAt ? time(trip.endedAt) : "Recording"} />
        <Stat label="Stop" value={trip.stopReason ? stopText[trip.stopReason] : "None yet"} />
        <Stat label="Points" value={String(trip.pointCount)} />

        <Heading>Vehicle</Heading>
        {[...(vehicles?.filter((v) => !v.archived || v._id === trip.vehicleId) ?? []), null].map((v) => (
          <VehicleOption
            key={v?._id ?? "none"}
            vehicle={v}
            selected={(v?._id ?? null) === trip.vehicleId}
            onPress={() => run(() => setVehicle({ tripId: trip._id, vehicleId: v?._id ?? null }))}
          />
        ))}

        <View className="mt-8 gap-3">
          {completed && previous?.status === "completed" && (
            <Button
              title={`Merge with previous trip (${time(previous.startedAt)})`}
              onPress={() =>
                confirm("Merge trips?", "The previous trip and this trip become one trip.", "Merge", async () => {
                  await merge({ firstId: previous._id, secondId: trip._id })
                  router.replace(`/trip/${previous._id}`)
                })
              }
            />
          )}
          <Button
            title="Delete trip"
            tone="danger"
            onPress={() =>
              confirm("Delete trip?", "The trip and its route are deleted for good.", "Delete", async () => {
                await remove({ tripId: trip._id })
                router.back()
              })
            }
          />
          <ErrorText>{error}</ErrorText>
        </View>
      </View>
    </ScrollView>
  )
}

function VehicleOption({ vehicle, selected, onPress }: { vehicle: Doc<"vehicles"> | null; selected: boolean; onPress: () => void }) {
  return (
    <Pressable disabled={selected} onPress={onPress} className="flex-row justify-between border-b border-neutral-900 py-3 active:opacity-60">
      <Text className="text-base text-white">{vehicle?.name ?? "No vehicle"}</Text>
      {selected && <Text className="text-base text-white">✓</Text>}
    </Pressable>
  )
}

/** Apple Maps with the full route from trips.points. */
function RouteMap({ points }: { points: GpsPoint[] | undefined }) {
  if (!points || points.length === 0) return <View className="h-72 bg-neutral-950" />
  const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lng }))
  let [minLat, maxLat, minLng, maxLng] = [90, -90, 180, -180]
  for (const p of points) {
    minLat = Math.min(minLat, p.lat)
    maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng)
    maxLng = Math.max(maxLng, p.lng)
  }
  return (
    <MapView
      style={{ height: 288 }}
      userInterfaceStyle="dark"
      initialRegion={{
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(0.005, (maxLat - minLat) * 1.3),
        longitudeDelta: Math.max(0.005, (maxLng - minLng) * 1.3),
      }}
    >
      <Polyline coordinates={coords} strokeColor="#0A84FF" strokeWidth={4} />
    </MapView>
  )
}
