// Expo inlines EXPO_PUBLIC_* only when read as plain `process.env.NAME`.
export const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? ""
export const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? ""
export const isConfigured = convexUrl !== "" && clerkKey !== ""
