// Expo configures Metro for monorepos itself (SDK 52+). Only NativeWind is added here.
const { getDefaultConfig } = require("expo/metro-config")
const { withNativeWind } = require("nativewind/metro")

module.exports = withNativeWind(getDefaultConfig(__dirname), { input: "./global.css" })
