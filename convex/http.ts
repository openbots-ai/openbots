import { httpRouter } from 'convex/server'
import { auth } from './auth'

const http = httpRouter()

// Sign-in endpoints for Convex Auth. Texting webhooks go to your engine, not here.
auth.addHttpRoutes(http)

export default http
