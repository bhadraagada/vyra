import { useEffect, useState, useSyncExternalStore } from "react"

/** Change signal for local recording data. The engine and the outbox call notify() after each write. */
let version = 0
const listeners = new Set<() => void>()

export function notify() {
  version++
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Reads local data with `read` and reads it again after every notify(). Returns undefined until the first read. */
export function useLocal<T>(read: () => Promise<T>): T | undefined {
  const current = useSyncExternalStore(subscribe, () => version)
  const [value, setValue] = useState<T>()
  useEffect(() => {
    let live = true
    void read().then((v) => live && setValue(v))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])
  return value
}
