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

/** Starts a trip for a drive that native code found. Resolves true when the trip records. */
async function startMotionTrip(at: number) {
  // startTrip refuses a motion start when detection is off.
  const error = await startTrip("motion", null, at)
  if (error) console.warn("drive detection did not start a trip:", error)
  return error === null
}

// Native code also stores the drive as pending, for a launch where JS was not listening. Clear it after the start is saved.
// Left pending, it would start a second, stale trip at the next launch.
motion.addDriveDetectedListener(({ at }) => {
  void startMotionTrip(at).then((started) => started && motion.takePendingDriveStart())
})
motion.addActivityListener(({ activity, confidence, at }) => {
  if (confidence !== "low") void onActivity(activity, at)
})

void resumeTracking().catch((e: unknown) => console.warn("resume tracking failed", e))

// A drive found more than 30 min ago is over or nearly over. A trip started now would be wrong.
const PENDING_MAX_AGE_MS = 30 * 60_000
const pending = motion.takePendingDriveStart()
if (pending !== null && Date.now() - pending < PENDING_MAX_AGE_MS) void startMotionTrip(pending)

AppState.addEventListener("change", (state) => {
  if (state === "active") void flush(true)
})
Network.addNetworkStateListener(({ isConnected, isInternetReachable }) => {
  if (isConnected && isInternetReachable !== false) void flush(true)
})
