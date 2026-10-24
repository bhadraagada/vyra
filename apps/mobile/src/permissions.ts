import * as Location from "expo-location"

/** "always" records with the screen locked. "foreground" records only while the app is open or was started open. */
export type LocationAccess = "always" | "foreground" | "denied" | "unknown"

export async function locationAccess(): Promise<{ access: LocationAccess; canAsk: boolean }> {
  const fg = await Location.getForegroundPermissionsAsync()
  if (!fg.granted) return { access: fg.status === "undetermined" ? "unknown" : "denied", canAsk: fg.canAskAgain }
  const bg = await Location.getBackgroundPermissionsAsync()
  return { access: bg.granted ? "always" : "foreground", canAsk: bg.canAskAgain }
}

/** Asks for "While Using" first, then "Always". iOS allows the second prompt only after the first is granted. */
export async function requestLocation(): Promise<LocationAccess> {
  const fg = await Location.requestForegroundPermissionsAsync()
  if (!fg.granted) return "denied"
  const bg = await Location.requestBackgroundPermissionsAsync()
  return bg.granted ? "always" : "foreground"
}
