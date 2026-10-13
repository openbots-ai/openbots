import { httpRouter } from 'convex/server'
import { auth } from './auth'

const http = httpRouter()

// Sign-in endpoints for Convex Auth
auth.addHttpRoutes(http)

export default http
