import type { ExpoConfig } from "expo/config"

const config: ExpoConfig = {
  name: "VYRA",
  slug: "vyra",
  scheme: "vyra",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  backgroundColor: "#000000",
  platforms: ["ios"],
  ios: {
    bundleIdentifier: "com.bhadra.vyra",
    supportsTablet: false,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-sqlite",
    [
      "expo-location",
      {
        isIosBackgroundLocationEnabled: true,
        locationWhenInUsePermission: "VYRA uses your location to record your drives.",
        locationAlwaysAndWhenInUsePermission:
          "VYRA uses your location in the background to record drives while your phone is locked.",
        locationAlwaysPermission: false,
        motionUsagePermission: "VYRA uses motion data to detect when you start and stop driving.",
      },
    ],
  ],
  experiments: { typedRoutes: true },
}

export default config
