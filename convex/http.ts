import { httpRouter } from 'convex/server'
import { auth } from './auth'

const http = httpRouter()

// Sign-in endpoints for Convex Auth. Texting webhooks go to your agent, not here.
auth.addHttpRoutes(http)

export default http
