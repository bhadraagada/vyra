import type { ReactNode } from "react"
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native"

/** Shared plain controls. True black, white text, no card chrome. */

export function Button({ title, onPress, tone = "default", disabled }: {
  title: string
  onPress: () => void
  tone?: "default" | "primary" | "danger"
  disabled?: boolean
}) {
  const color = tone === "primary" ? "bg-white" : tone === "danger" ? "border border-red-500" : "border border-neutral-700"
  const text = tone === "primary" ? "text-black" : tone === "danger" ? "text-red-500" : "text-white"
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`items-center rounded-md px-4 py-3 ${color} ${disabled ? "opacity-40" : "active:opacity-60"}`}
    >
      <Text className={`text-base font-semibold ${text}`}>{title}</Text>
    </Pressable>
  )
}

export function Field(props: TextInputProps & { label: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xs uppercase text-neutral-400">{props.label}</Text>
      <TextInput
        placeholderTextColor="#666"
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        className="border-b border-neutral-800 py-2 text-base text-white"
      />
    </View>
  )
}

export const Heading = ({ children }: { children: ReactNode }) => (
  <Text className="mt-6 mb-2 text-lg font-semibold text-white">{children}</Text>
)

/** Label on the left, value on the right. */
export const Stat = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row justify-between border-b border-neutral-900 py-2">
    <Text className="text-base text-neutral-400">{label}</Text>
    <Text className="text-base text-white">{value}</Text>
  </View>
)

export const ErrorText = ({ children }: { children: ReactNode }) =>
  children ? <Text className="text-sm text-red-500">{children}</Text> : null
