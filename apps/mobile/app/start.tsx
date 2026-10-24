import { Redirect, useLocalSearchParams } from "expo-router"
import { useEffect } from "react"
import { startTrip } from "../src/recording/engine"
import { requestLocation } from "../src/permissions"

/** vyra://start?vehicle=<triggerKey>. Shortcuts opens this on CarPlay or Bluetooth connect. */
export default function StartLink() {
  const { vehicle } = useLocalSearchParams<{ vehicle?: string }>()
  useEffect(() => {
    void requestLocation().then(() => startTrip("shortcut", vehicle?.trim().toLowerCase() || null))
  }, [vehicle])
  return <Redirect href="/" />
}
