import { Redirect, useLocalSearchParams } from "expo-router"
import { useEffect } from "react"
import { stopTrip } from "../src/recording/engine"

/** vyra://stop and vyra://stop?reason=disconnect. Shortcuts opens the second one on car disconnect. */
export default function StopLink() {
  const { reason } = useLocalSearchParams<{ reason?: string }>()
  useEffect(() => {
    void stopTrip(reason === "disconnect" ? "disconnect" : "manual")
  }, [reason])
  return <Redirect href="/" />
}
