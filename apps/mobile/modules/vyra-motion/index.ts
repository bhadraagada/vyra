import { NativeModule, requireOptionalNativeModule, type EventSubscription } from "expo"

export type MotionActivity = "automotive" | "walking" | "running" | "cycling" | "stationary" | "unknown"
export type ActivityEvent = { activity: MotionActivity; confidence: "low" | "medium" | "high"; at: number }
export type DriveDetectedEvent = { at: number }

type Events = {
  onActivity: (e: ActivityEvent) => void
  onDriveDetected: (e: DriveDetectedEvent) => void
}

declare class VyraMotionNative extends NativeModule<Events> {
  isAvailable(): boolean
  setAutoStartEnabled(enabled: boolean): void
  isAutoStartEnabled(): boolean
  startActivityUpdates(): void
  stopActivityUpdates(): void
  takePendingDriveStart(): number | null | undefined
}

// Null on web, in Expo Go and in builds without the module. Every call then does nothing.
const native = requireOptionalNativeModule<VyraMotionNative>("VyraMotion")
const noSubscription: EventSubscription = { remove() {} }

export function isAvailable(): boolean {
  return native?.isAvailable() ?? false
}

/**
 * Turns significant location change monitoring on or off. iOS keeps it across relaunch.
 * isAutoStartEnabled() returns the new value right after. Turning it off also clears a pending drive start.
 */
export function setAutoStartEnabled(enabled: boolean): void {
  native?.setAutoStartEnabled(enabled)
}

export function isAutoStartEnabled(): boolean {
  return native?.isAutoStartEnabled() ?? false
}

export function startActivityUpdates(): void {
  native?.startActivityUpdates()
}

export function stopActivityUpdates(): void {
  native?.stopActivityUpdates()
}

/** Start in epoch ms of the last detected drive, kept until read so a launch where JS was not listening still sees it. Cleared on read. */
export function takePendingDriveStart(): number | null {
  return native?.takePendingDriveStart() ?? null
}

export function addActivityListener(cb: (e: ActivityEvent) => void): { remove(): void } {
  return native?.addListener("onActivity", cb) ?? noSubscription
}

export function addDriveDetectedListener(cb: (e: DriveDetectedEvent) => void): { remove(): void } {
  return native?.addListener("onDriveDetected", cb) ?? noSubscription
}
