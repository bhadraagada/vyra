# VYRA build plan

VYRA is a personal driving tracker. The iPhone app records trips. The web dashboard shows history, analytics and a garage. v1 users are the owner and at most 2 friends.

## Decisions

| Area | Decision |
|---|---|
| Backend | Convex cloud. Code in `packages/backend/convex`. |
| Auth | Clerk, email code sign-in. Convex validates Clerk JWTs from the JWT template named `convex`. |
| Web | Next.js (app router), Tailwind, `@clerk/nextjs`, `convex/react`. Code in `apps/web`. |
| Mobile | Expo dev client, Expo Router, NativeWind, Clerk Expo SDK, `convex/react`. Code in `apps/mobile`. |
| Shared logic | `packages/core`: geo, trip stats, trip state machine, route cells, fuel economy, chunk columns. Both apps and Convex import it. |
| Maps | Phone: `react-native-maps` (Apple Maps). Web: MapLibre GL JS with OpenFreeMap tiles. |
| iOS builds | GitHub Actions macOS runner makes an unsigned `.ipa`. The owner signs it with Sideloadly and a free Apple ID. No paid Apple account, no EAS. |
| Social | None. All data is private. |

## Names

- App name `VYRA`. URL scheme `vyra`. Bundle ID `com.bhadra.vyra`.
- `vyra://start?vehicle=<triggerKey>` starts a trip. `vehicle` is optional.
- `vyra://stop` stops a trip. `vyra://stop?reason=disconnect` marks a car disconnect.

## Trip rules

These rules live in `packages/core/src/tripMachine.ts`. Do not copy them into app code.

- A trip starts from a manual tap, a Shortcuts deep link (`shortcut`), or the native motion module (`motion`).
- A motion start and a Shortcut start for the same drive make one trip. The Shortcut sets the vehicle.
- Manual stop and CarPlay or Bluetooth disconnect end the trip at once.
- While the car is connected (Shortcut start), standing still never ends the trip.
- Without a car connection, 1 min of walking ends the trip. 15 min without movement ends the trip. In both cases the end time is the last movement.

## Data flow

1. The phone writes every point to SQLite first. A dead zone or app kill must not lose points.
2. The phone uploads through an outbox in SQLite, in order: `trips.start`, then `trips.appendChunk` for each chunk of up to 500 points (`CHUNK_SIZE`), then `trips.finish`.
3. Every call is idempotent. `start` is keyed by `clientId` (UUID made on the phone). `appendChunk` is keyed by `(clientId, seq)`. `finish` on a completed trip with the same values is a no-op.
4. Chunks upload during the trip when there is signal. Failed calls retry with backoff. Order is kept per trip.
5. Convex recomputes stats from the chunks with `tripStats` from `@vyra/core` on finish, on a late chunk, and on every edit. It keeps `dailyTotals` correct by removing the old trip contribution and adding the new one.

## Convex functions

Every function gets the owner from `ctx.auth.getUserIdentity()` and uses `identity.tokenIdentifier` as `ownerId`. Every read and write checks the owner. Throw `ConvexError` for user-facing errors.

- `vehicles`: `list`, `get`, `create`, `update`, `setDefault`, `archive`. `triggerKey` is unique per owner and is lowercase `[a-z0-9-]`. The first vehicle becomes the default.
- `trips`:
  - `start({ clientId, startSource, startedAt, tzOffsetMin, vehicleKey })`. Resolves `vehicleKey` to a vehicle by `triggerKey`, else the default vehicle, else null.
  - `appendChunk({ clientId, seq, ...pointColumns })`. Updates `pointCount` and the live `polyline` while recording.
  - `finish({ clientId, endedAt, stopReason, vehicleKey })`. Drops points after `endedAt`, recomputes stats, cells and `routeKey`, sets status `completed`, updates `dailyTotals`.
  - `list` (paginated, newest first, optional `vehicleId`), `get`, `points` (all chunks merged), `live` (the recording trip, if any).
  - Edits: `remove`, `setVehicle`, `merge({ firstId, secondId })` for two completed trips of one owner, `trim({ tripId, startAt, endAt })`.
- `analytics`: `daily({ fromDay, toDay })`, `records`, `frequentRoutes`.
- `garage`: odometer, fuel and service entries (`add`, `list`, `remove` each), and `vehicleSummary({ vehicleId })` with trip totals, latest odometer and fuel economy from `fuelSpans`.

## Phone recording

- `expo-location` background updates with `TaskManager`. Accuracy `BestForNavigation`, activity type automotive navigation, `pausesUpdatesAutomatically: false`, `showsBackgroundLocationIndicator: true`, distance filter 0.
- Every location update runs the trip machine, so updates also act as clock ticks. Store a point only if it moved at least 3 m or 10 s passed since the last stored point.
- Persist the trip machine state in SQLite after each change, so an app relaunch continues the trip.
- The Clerk token cache in SecureStore must use `AFTER_FIRST_UNLOCK`. With the default, uploads fail while the phone is locked.
- Background uploads use `ConvexHttpClient` with a fresh Clerk token, not the React client.

## Native motion module

`apps/mobile/modules/vyra-motion` is a local Expo module in Swift. JS API:

```ts
export type MotionActivity = "automotive" | "walking" | "running" | "cycling" | "stationary" | "unknown"
export function isAvailable(): boolean
export function setAutoStartEnabled(enabled: boolean): void // significant location change monitoring, kept across relaunch
export function isAutoStartEnabled(): boolean
export function startActivityUpdates(): void
export function stopActivityUpdates(): void
export function takePendingDriveStart(): number | null // epoch ms, cleared on read
export function addActivityListener(cb: (e: { activity: MotionActivity; confidence: "low" | "medium" | "high"; at: number }) => void): { remove(): void }
export function addDriveDetectedListener(cb: (e: { at: number }) => void): { remove(): void }
```

On a significant location change, the module asks CoreMotion for activity in the last 5 min. If it finds automotive with medium or high confidence, it stores the time as a pending drive start and sends `onDriveDetected`. iOS can relaunch the app in the background for this, so the module must arm itself at app launch.

## UI rules

- True black `#000` background, white primary text, dense layout, minimal copy.
- No decorative cards or pills. No gray subtitle lines above sections. No em dashes.
- No continuously repainting animations: no pulse, shimmer or spinners that loop.
- Units: km, km/h, litres, km/L. Show local times.

## Environment

- Web: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
- Mobile: `EXPO_PUBLIC_CONVEX_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`. If one is missing, the app shows a "not configured" screen instead of crashing.
- Convex: `CLERK_JWT_ISSUER_DOMAIN`.
- Local dev without a Convex account: `CONVEX_AGENT_MODE=anonymous npx convex dev` in `packages/backend`.
