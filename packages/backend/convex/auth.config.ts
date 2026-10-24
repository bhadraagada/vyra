// Clerk JWT template "convex". Set CLERK_JWT_ISSUER_DOMAIN in the Convex dashboard.
export default {
  providers: [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN!, applicationID: "convex" }],
}
