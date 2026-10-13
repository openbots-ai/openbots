// Tells Convex to trust the tokens Convex Auth (convex/auth.ts) issues. Without this every user looks signed out.
export default {
    providers: [{ domain: process.env.CONVEX_SITE_URL, applicationID: 'convex' }],
}
