import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
import { createRouter } from './src/router'

const router = createRouter()

hydrateRoot(
  document,
  <StartClient router={router} />
)