import { StartClient } from '@tanstack/react-start/client'
import { createRouter } from './src/router'

const router = createRouter()

// Ensure we only render on the client
if (typeof window !== 'undefined') {
  StartClient({ router })
}