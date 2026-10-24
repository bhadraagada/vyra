import { api } from "@vyra/backend/convex/_generated/api"
import type { Doc } from "@vyra/backend/convex/_generated/dataModel"
import { usePaginatedQuery } from "convex/react"
import { Link } from "expo-router"
import { Alert, FlatList, Pressable, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { dateTime, duration, km, kmh } from "../../../src/format"
import { pendingTrips } from "../../../src/recording/db"
import { useLocal } from "../../../src/recording/events"
import { claimTrip, deleteLocalTrip } from "../../../src/recording/outbox"

/** Trips tab: trips on this phone that still wait for upload, then all trips from Convex, newest first. */
export default function Trips() {
  const { results, status, loadMore } = usePaginatedQuery(api.trips.list, {}, { initialNumItems: 30 })
  const local = useLocal(pendingTrips)

  return (
    <SafeAreaView className="flex-1 bg-black" edges={["top"]}>
      <FlatList
        data={results}
        keyExtractor={(t) => t._id}
        renderItem={({ item }) => <TripRow trip={item} />}
        onEndReached={() => status === "CanLoadMore" && loadMore(30)}
        contentContainerClassName="px-5 pb-10"
        ListHeaderComponent={
          <View>
            <Text className="pt-4 pb-2 text-3xl font-semibold text-white">Trips</Text>
            {local?.map((t) => <LocalRow key={t.client_id} trip={t} />)}
          </View>
        }
        ListEmptyComponent={
          status === "LoadingFirstPage" ? undefined : <Text className="py-4 text-base text-white">No trips yet.</Text>
        }
      />
    </SafeAreaView>
  )
}

function TripRow({ trip }: { trip: Doc<"trips"> }) {
  const recording = trip.status === "recording"
  return (
    <Link href={`/trip/${trip._id}`} asChild>
      <Pressable className="border-b border-neutral-900 py-3 active:opacity-60">
        <View className="flex-row justify-between">
          <Text className="text-base text-white">{dateTime(trip.startedAt)}</Text>
          <Text className="text-base font-semibold text-white">{km(trip.distanceM)}</Text>
        </View>
        <Text className="text-sm text-neutral-400">
          {recording ? "Recording" : `${duration(trip.durationS)}  ·  avg ${kmh(trip.avgSpeedMps)}  ·  max ${kmh(trip.maxSpeedMps)}`}
        </Text>
      </Pressable>
    </Link>
  )
}

type Local = NonNullable<Awaited<ReturnType<typeof pendingTrips>>>[number]

/** A trip on this phone. Tap a failed trip to delete it. Tap a trip with no owner to upload it to this account or delete it. */
function LocalRow({ trip }: { trip: Local }) {
  const unowned = trip.owner === null
  const ended = trip.ended_at !== null
  const state = trip.failed
    ? `Upload failed: ${trip.failed}`
    : unowned
      ? "No account. Tap to upload it to this account."
      : !ended
        ? "Recording on this phone"
        : trip.last_error
          ? `Waiting to upload, ${trip.pending} left. Last error: ${trip.last_error}`
          : `Uploading, ${trip.pending} left`
  const remove = { text: "Delete", style: "destructive", onPress: () => void deleteLocalTrip(trip.client_id) } as const
  const onPress = () =>
    unowned
      ? Alert.alert("Upload to this account?", "This trip was recorded while signed out or before an app update.", [
          { text: "Cancel", style: "cancel" },
          ...(ended ? [remove] : []),
          { text: "Upload", onPress: () => void claimTrip(trip.client_id) },
        ])
      : Alert.alert("Delete local copy?", "This trip was not uploaded. Deleting removes its points from this phone.", [
          { text: "Cancel", style: "cancel" },
          remove,
        ])
  return (
    <Pressable
      disabled={!unowned && (!trip.failed || !ended)}
      onPress={onPress}
      className="border-b border-neutral-900 py-3"
    >
      <View className="flex-row justify-between">
        <Text className="text-base text-white">{dateTime(trip.started_at)}</Text>
        <Text className="text-base text-white">{trip.points} points</Text>
      </View>
      <Text className={`text-sm ${trip.failed ? "text-red-500" : "text-neutral-400"}`}>{state}</Text>
    </Pressable>
  )
}
