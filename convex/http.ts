import { httpRouter } from 'convex/server'

// Sign-in is Clerk's and texting webhooks go to your engine, so nothing is served here yet
const http = httpRouter()

export default http
