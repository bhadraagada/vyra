import type { GpsPoint } from "@vyra/core"
import { AppState } from "react-native"
import * as Location from "expo-location"
import * as Network from "expo-network"
import * as TaskManager from "expo-task-manager"
import * as motion from "../../modules/vyra-motion"
import { LOCATION_TASK, onActivity, onLocations, resumeTracking, startTrip } from "./engine"
import { flush } from "./outbox"

/*
 * Wires every recording input at module scope. The root layout imports this file, so it also runs
 * when iOS relaunches the app in the background for a location update or a motion drive start.
 */

const toPoint = ({ coords, timestamp }: Location.LocationObject): GpsPoint => ({
  t: timestamp,
  lat: coords.latitude,
  lng: coords.longitude,
  // iOS reports -1 for an invalid speed or heading.
  speed: coords.speed !== null && coords.speed >= 0 ? coords.speed : null,
  accuracy: coords.accuracy ?? Number.MAX_SAFE_INTEGER,
  heading: coords.heading !== null && coords.heading >= 0 ? coords.heading : null,
  altitude: coords.altitude,
})

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return
  await onLocations(data.locations.map(toPoint))
})

motion.addDriveDetectedListener(({ at }) => void startTrip("motion", null, at))
motion.addActivityListener(({ activity, confidence, at }) => {
  if (confidence !== "low") void onActivity(activity, at)
})

void resumeTracking().catch((e: unknown) => console.warn("resume tracking failed", e))

const pending = motion.takePendingDriveStart()
if (pending !== null) void startTrip("motion", null, pending)

AppState.addEventListener("change", (state) => {
  if (state === "active") void flush(true)
})
Network.addNetworkStateListener(({ isConnected, isInternetReachable }) => {
  if (isConnected && isInternetReachable !== false) void flush(true)
})
