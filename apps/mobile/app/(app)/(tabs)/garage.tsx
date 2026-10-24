import { api } from "@vyra/backend/convex/_generated/api"
import { useMutation, useQuery } from "convex/react"
import { Link } from "expo-router"
import { useState } from "react"
import { Pressable, ScrollView, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { errorText } from "../../../src/format"
import { Button, ErrorText, Field, Heading } from "../../../src/ui"

/** Garage tab: vehicles and a form to add one. Tap a vehicle to edit it and log fuel, odometer and service. */
export default function Garage() {
  const vehicles = useQuery(api.vehicles.list)
  const create = useMutation(api.vehicles.create)
  const [name, setName] = useState("")
  const [key, setKey] = useState("")
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    setError(null)
    create({ name: name.trim(), triggerKey: key })
      .then(() => {
        setName("")
        setKey("")
      })
      .catch((e: unknown) => setError(errorText(e)))
  }

  return (
    <SafeAreaView className="flex-1 bg-black" edges={["top"]}>
      <ScrollView contentContainerClassName="px-5 pb-12" keyboardShouldPersistTaps="handled">
        <Text className="pt-4 pb-2 text-3xl font-semibold text-white">Garage</Text>
        {vehicles?.filter((v) => !v.archived).map((v) => (
          <Link key={v._id} href={`/vehicle/${v._id}`} asChild>
            <Pressable className="border-b border-neutral-900 py-3 active:opacity-60">
              <View className="flex-row justify-between">
                <Text className="text-base text-white">{v.name}</Text>
                {v.isDefault && <Text className="text-base text-white">Default</Text>}
              </View>
              <Text className="text-sm text-neutral-400">vyra://start?vehicle={v.triggerKey}</Text>
            </Pressable>
          </Link>
        ))}
        {vehicles?.length === 0 && <Text className="py-3 text-base text-white">No vehicles yet.</Text>}

        <Heading>Add vehicle</Heading>
        <View className="gap-4">
          <Field label="Name" value={name} onChangeText={setName} placeholder="Swift" autoCapitalize="words" />
          <Field label="Trigger key (a-z, 0-9, -)" value={key} onChangeText={setKey} placeholder="swift" />
          <Button title="Add vehicle" tone="primary" disabled={!name.trim() || !key.trim()} onPress={add} />
          <ErrorText>{error}</ErrorText>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
