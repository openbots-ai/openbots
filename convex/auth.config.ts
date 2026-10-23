// Tells Convex to trust Clerk's sign-in tokens. CLERK_JWT_ISSUER_DOMAIN is the Frontend API URL from the Clerk
// dashboard (Configure → API keys). Without it every user looks signed out.
export default {
    providers: [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN, applicationID: 'convex' }],
}
