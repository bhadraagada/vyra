import { api } from "@vyra/backend/convex/_generated/api"
import type { Doc, Id } from "@vyra/backend/convex/_generated/dataModel"
import { useMutation, useQuery } from "convex/react"
import { router, useLocalSearchParams } from "expo-router"
import { useState } from "react"
import { Pressable, ScrollView, Switch, Text, View } from "react-native"
import { dateTime, errorText, km } from "../../../src/format"
import { Button, ErrorText, Field, Heading, Stat } from "../../../src/ui"

/** "" becomes undefined, anything else a number. NaN means the input is not a number. */
const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")))
const bad = (...values: (number | undefined)[]) => values.some((v) => v !== undefined && !Number.isFinite(v))

/** Vehicle screen: details, Shortcut link, default and archive, summary, and fuel, odometer and service logs. */
export default function VehicleScreen() {
  const vehicleId = useLocalSearchParams<{ id: string }>().id as Id<"vehicles">
  const vehicle = useQuery(api.vehicles.get, { vehicleId })
  const summary = useQuery(api.garage.vehicleSummary, vehicle ? { vehicleId } : "skip")
  const setDefault = useMutation(api.vehicles.setDefault)
  const archive = useMutation(api.vehicles.archive)
  const [error, setError] = useState<string | null>(null)

  if (vehicle === undefined) return <View className="flex-1 bg-black" />
  if (vehicle === null) return <Text className="flex-1 bg-black p-5 text-base text-white">This vehicle does not exist.</Text>

  const run = (action: () => Promise<unknown>) => {
    setError(null)
    action().catch((e: unknown) => setError(errorText(e)))
  }

  return (
    <ScrollView className="flex-1 bg-black" contentContainerClassName="px-5 pb-12" keyboardShouldPersistTaps="handled">
      <Text className="pt-4 text-2xl font-semibold text-white">{vehicle.name}</Text>
      <Text selectable className="py-2 text-base text-white">
        vyra://start?vehicle={vehicle.triggerKey}
      </Text>

      {summary && (
        <View>
          <Stat label="Trips" value={String(summary.tripCount)} />
          <Stat label="Distance" value={km(summary.distanceM)} />
          <Stat label="Odometer" value={summary.latestOdometer ? `${Math.round(summary.latestOdometer.km)} km` : "No reading"} />
          <Stat label="Fuel economy" value={summary.avgKmPerL ? `${summary.avgKmPerL.toFixed(1)} km/L` : "Needs two full fills"} />
        </View>
      )}

      <View className="mt-4 flex-row gap-3">
        {!vehicle.isDefault && (
          <View className="flex-1">
            <Button title="Make default" onPress={() => run(() => setDefault({ vehicleId }))} />
          </View>
        )}
        <View className="flex-1">
          <Button
            title="Archive"
            tone="danger"
            onPress={() =>
              run(async () => {
                await archive({ vehicleId })
                router.back()
              })
            }
          />
        </View>
      </View>
      <ErrorText>{error}</ErrorText>

      <Details key={vehicle._id} vehicle={vehicle} />
      <Fuel vehicleId={vehicleId} />
      <Odometer vehicleId={vehicleId} />
      <Service vehicleId={vehicleId} />
    </ScrollView>
  )
}

function Details({ vehicle }: { vehicle: Doc<"vehicles"> }) {
  const update = useMutation(api.vehicles.update)
  const [f, setF] = useState({
    name: vehicle.name,
    triggerKey: vehicle.triggerKey,
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
    year: vehicle.year?.toString() ?? "",
    registration: vehicle.registration ?? "",
  })
  const [message, setMessage] = useState<string | null>(null)
  const set = (key: keyof typeof f) => (value: string) => setF({ ...f, [key]: value })
  const year = num(f.year)

  const save = () => {
    setMessage(null)
    update({
      vehicleId: vehicle._id,
      name: f.name.trim(),
      triggerKey: f.triggerKey,
      make: f.make.trim(),
      model: f.model.trim(),
      year,
      registration: f.registration.trim(),
    })
      .then(() => setMessage("Saved"))
      .catch((e: unknown) => setMessage(errorText(e)))
  }

  return (
    <View className="gap-4">
      <Heading>Details</Heading>
      <Field label="Name" value={f.name} onChangeText={set("name")} autoCapitalize="words" />
      <Field label="Trigger key" value={f.triggerKey} onChangeText={set("triggerKey")} />
      <Field label="Make" value={f.make} onChangeText={set("make")} autoCapitalize="words" />
      <Field label="Model" value={f.model} onChangeText={set("model")} autoCapitalize="words" />
      <Field label="Year" value={f.year} onChangeText={set("year")} keyboardType="number-pad" />
      <Field label="Registration" value={f.registration} onChangeText={set("registration")} autoCapitalize="characters" />
      <Button title="Save" disabled={!f.name.trim() || bad(year)} onPress={save} />
      {message && <Text className="text-sm text-white">{message}</Text>}
    </View>
  )
}

type VehicleProp = { vehicleId: Id<"vehicles"> }

function Fuel({ vehicleId }: VehicleProp) {
  const entries = useQuery(api.garage.listFuel, { vehicleId })
  const add = useMutation(api.garage.addFuel)
  const remove = useMutation(api.garage.removeFuel)
  const [f, setF] = useState({ odometer: "", litres: "", cost: "", full: true })
  const [odometerKm, litres, totalCost] = [num(f.odometer), num(f.litres), num(f.cost)]
  const [error, setError] = useState<string | null>(null)
  const ready = odometerKm !== undefined && litres !== undefined && totalCost !== undefined && !bad(odometerKm, litres, totalCost)

  const save = () => {
    if (!ready) return
    setError(null)
    add({ vehicleId, at: Date.now(), odometerKm, litres, totalCost, fullTank: f.full })
      .then(() => setF({ odometer: "", litres: "", cost: "", full: true }))
      .catch((e: unknown) => setError(errorText(e)))
  }

  return (
    <View className="gap-4">
      <Heading>Fuel</Heading>
      <Field label="Odometer km" value={f.odometer} onChangeText={(odometer) => setF({ ...f, odometer })} keyboardType="decimal-pad" />
      <Field label="Litres" value={f.litres} onChangeText={(litres) => setF({ ...f, litres })} keyboardType="decimal-pad" />
      <Field label="Total cost" value={f.cost} onChangeText={(cost) => setF({ ...f, cost })} keyboardType="decimal-pad" />
      <View className="flex-row items-center justify-between">
        <Text className="text-base text-white">Full tank</Text>
        <Switch value={f.full} onValueChange={(full) => setF({ ...f, full })} />
      </View>
      <Button title="Add fuel" disabled={!ready} onPress={save} />
      <ErrorText>{error}</ErrorText>
      {entries?.map((e) => (
        <Entry
          key={e._id}
          title={`${e.litres} L, ${e.totalCost}${e.fullTank ? ", full" : ""}`}
          detail={`${dateTime(e.at)}  ·  ${e.odometerKm} km`}
          onDelete={() => void remove({ entryId: e._id })}
        />
      ))}
    </View>
  )
}

function Odometer({ vehicleId }: VehicleProp) {
  const entries = useQuery(api.garage.listOdometer, { vehicleId })
  const add = useMutation(api.garage.addOdometer)
  const remove = useMutation(api.garage.removeOdometer)
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const kmValue = num(value)

  const save = () => {
    if (kmValue === undefined) return
    setError(null)
    add({ vehicleId, at: Date.now(), km: kmValue })
      .then(() => setValue(""))
      .catch((e: unknown) => setError(errorText(e)))
  }

  return (
    <View className="gap-4">
      <Heading>Odometer</Heading>
      <Field label="Reading km" value={value} onChangeText={setValue} keyboardType="decimal-pad" />
      <Button title="Add reading" disabled={kmValue === undefined || bad(kmValue)} onPress={save} />
      <ErrorText>{error}</ErrorText>
      {entries?.map((e) => (
        <Entry key={e._id} title={`${e.km} km`} detail={dateTime(e.at)} onDelete={() => void remove({ entryId: e._id })} />
      ))}
    </View>
  )
}

function Service({ vehicleId }: VehicleProp) {
  const entries = useQuery(api.garage.listService, { vehicleId })
  const add = useMutation(api.garage.addService)
  const remove = useMutation(api.garage.removeService)
  const [f, setF] = useState({ kind: "", cost: "", odometer: "" })
  const [cost, odometerKm] = [num(f.cost), num(f.odometer)]
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    setError(null)
    add({ vehicleId, at: Date.now(), kind: f.kind.trim(), cost, odometerKm })
      .then(() => setF({ kind: "", cost: "", odometer: "" }))
      .catch((e: unknown) => setError(errorText(e)))
  }

  return (
    <View className="gap-4">
      <Heading>Service</Heading>
      <Field label="Work done" value={f.kind} onChangeText={(kind) => setF({ ...f, kind })} placeholder="Oil change" autoCapitalize="sentences" />
      <Field label="Cost" value={f.cost} onChangeText={(c) => setF({ ...f, cost: c })} keyboardType="decimal-pad" />
      <Field label="Odometer km" value={f.odometer} onChangeText={(odometer) => setF({ ...f, odometer })} keyboardType="decimal-pad" />
      <Button title="Add service" disabled={!f.kind.trim() || bad(cost, odometerKm)} onPress={save} />
      <ErrorText>{error}</ErrorText>
      {entries?.map((e) => (
        <Entry
          key={e._id}
          title={e.cost === undefined ? e.kind : `${e.kind}, ${e.cost}`}
          detail={e.odometerKm === undefined ? dateTime(e.at) : `${dateTime(e.at)}  ·  ${e.odometerKm} km`}
          onDelete={() => void remove({ entryId: e._id })}
        />
      ))}
    </View>
  )
}

function Entry({ title, detail, onDelete }: { title: string; detail: string; onDelete: () => void }) {
  return (
    <View className="flex-row items-center justify-between border-b border-neutral-900 py-2">
      <View>
        <Text className="text-base text-white">{title}</Text>
        <Text className="text-sm text-neutral-400">{detail}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onDelete} className="px-2 py-2 active:opacity-60">
        <Text className="text-base text-red-500">Delete</Text>
      </Pressable>
    </View>
  )
}
