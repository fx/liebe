import { useEffect, useState, useCallback } from 'react'
import * as Comlink from 'comlink'
import type { HassEntity } from '../store/entityTypes'
import { entitySearchWorkerCode } from '../workers/entitySearchWorkerCode'

// Worker API type
interface EntitySearchWorkerAPI {
  initializeIndex(entities: HassEntity[]): Promise<{
    totalEntities: number
    domains: string[]
  }>
  search(
    query: string,
    excludedIds?: string[],
    limit?: number
  ): Promise<{
    results: HassEntity[]
    totalCount: number
    groupedByDomain: Record<string, HassEntity[]>
    totalEntities?: number
  }>
  getEntitiesByDomain(domain: string, excludedIds?: string[]): Promise<HassEntity[]>
  getDomains(): Promise<string[]>
  updateEntity(entity: HassEntity): Promise<void>
  removeEntity(entityId: string): Promise<void>
  getEntityCount(): Promise<number>
}

let workerInstance: Worker | null = null
let workerAPI: EntitySearchWorkerAPI | null = null
let initializationPromise: Promise<void> | null = null

// Create worker from inline code
function createInlineWorker(): Worker {
  const blob = new Blob([entitySearchWorkerCode], { type: 'application/javascript' })
  const workerUrl = URL.createObjectURL(blob)
  return new Worker(workerUrl)
}

// Singleton worker initialization
async function getWorkerAPI(): Promise<EntitySearchWorkerAPI> {
  if (workerAPI) return workerAPI

  if (!workerInstance) {
    // Always use inline worker for now to avoid build issues
    workerInstance = createInlineWorker()
    workerAPI = Comlink.wrap<EntitySearchWorkerAPI>(workerInstance)
  }

  return workerAPI!
}

export function useEntitySearch(entities: Record<string, HassEntity>) {
  console.log('[useEntitySearch] Hook called with', Object.keys(entities).length, 'entities')
  const [isIndexing, setIsIndexing] = useState(true)
  const [searchResults, setSearchResults] = useState<{
    results: HassEntity[]
    totalCount: number
    groupedByDomain: Record<string, HassEntity[]>
    totalEntities?: number
  }>({
    results: [],
    totalCount: 0,
    groupedByDomain: {},
  })
  const [indexStats, setIndexStats] = useState<{
    totalEntities: number
    domains: string[]
  }>({
    totalEntities: 0,
    domains: [],
  })

  // Initialize or update the search index
  useEffect(() => {
    const initializeIndex = async () => {
      try {
        console.log('[useEntitySearch] Starting index initialization...')
        const startTime = performance.now()
        const api = await getWorkerAPI()
        const entityArray = Object.values(entities)

        // Only initialize once or when entity count changes significantly
        if (
          !initializationPromise ||
          Math.abs(entityArray.length - indexStats.totalEntities) > 100
        ) {
          console.log('[useEntitySearch] Initializing index with', entityArray.length, 'entities')
          setIsIndexing(true)
          initializationPromise = api.initializeIndex(entityArray).then((stats) => {
            const duration = performance.now() - startTime
            console.log(
              '[useEntitySearch] Index initialized in',
              duration.toFixed(2),
              'ms, stats:',
              stats
            )
            setIndexStats(stats)
            setIsIndexing(false)
          })
        } else {
          console.log('[useEntitySearch] Skipping re-initialization, entity count similar')
        }

        await initializationPromise
      } catch (error) {
        console.error('Failed to initialize search index:', error)
        setIsIndexing(false)
      }
    }

    initializeIndex()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities])

  // Search function
  const search = useCallback(
    async (query: string, excludedIds: string[] = [], limit?: number) => {
      console.log('[useEntitySearch] Search called, query:', query, 'isIndexing:', isIndexing)
      if (isIndexing) {
        console.log('[useEntitySearch] Search skipped - still indexing')
        return
      }

      try {
        const startTime = performance.now()
        const api = await getWorkerAPI()
        const results = await api.search(query, excludedIds, limit)
        const duration = performance.now() - startTime
        console.log('[useEntitySearch] Search completed in', duration.toFixed(2), 'ms, results:', {
          count: results.results.length,
          domains: Object.keys(results.groupedByDomain).length,
          totalEntities: results.totalEntities,
        })
        setSearchResults(results)
        return results
      } catch (error) {
        console.error('Search failed:', error)
        return {
          results: [],
          totalCount: 0,
          groupedByDomain: {},
          totalEntities: 0,
        }
      }
    },
    [isIndexing]
  )

  // Get entities by domain
  const getEntitiesByDomain = useCallback(
    async (domain: string, excludedIds: string[] = []) => {
      if (isIndexing) return []

      try {
        const api = await getWorkerAPI()
        return await api.getEntitiesByDomain(domain, excludedIds)
      } catch (error) {
        console.error('Failed to get entities by domain:', error)
        return []
      }
    },
    [isIndexing]
  )

  // Update single entity in the index
  const updateEntity = useCallback(async (entity: HassEntity) => {
    try {
      const api = await getWorkerAPI()
      await api.updateEntity(entity)
    } catch (error) {
      console.error('Failed to update entity in search index:', error)
    }
  }, [])

  // Remove entity from the index
  const removeEntity = useCallback(async (entityId: string) => {
    try {
      const api = await getWorkerAPI()
      await api.removeEntity(entityId)
    } catch (error) {
      console.error('Failed to remove entity from search index:', error)
    }
  }, [])

  return {
    isIndexing,
    search,
    searchResults,
    getEntitiesByDomain,
    updateEntity,
    removeEntity,
    indexStats,
  }
}

// Cleanup function for when the app unmounts
export function cleanupEntitySearchWorker() {
  if (workerInstance) {
    workerInstance.terminate()
    workerInstance = null
    workerAPI = null
    initializationPromise = null
  }
}
