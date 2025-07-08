import { useEffect, useState, useCallback } from 'react'
import * as Comlink from 'comlink'
import type { HassEntity } from '../store/entityTypes'

// Worker API type
interface EntitySearchWorkerAPI {
  initializeIndex(entities: HassEntity[]): Promise<{
    totalEntities: number
    domains: string[]
  }>
  search(
    query: string,
    excludedIds?: string[]
  ): Promise<{
    results: HassEntity[]
    totalCount: number
    groupedByDomain: Record<string, HassEntity[]>
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

// Singleton worker initialization
async function getWorkerAPI(): Promise<EntitySearchWorkerAPI> {
  if (workerAPI) return workerAPI

  if (!workerInstance) {
    workerInstance = new Worker(new URL('../workers/entitySearch.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerAPI = Comlink.wrap<EntitySearchWorkerAPI>(workerInstance)
  }

  return workerAPI!
}

export function useEntitySearch(entities: Record<string, HassEntity>) {
  const [isIndexing, setIsIndexing] = useState(true)
  const [searchResults, setSearchResults] = useState<{
    results: HassEntity[]
    totalCount: number
    groupedByDomain: Record<string, HassEntity[]>
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
        const api = await getWorkerAPI()
        const entityArray = Object.values(entities)

        // Only initialize once or when entity count changes significantly
        if (
          !initializationPromise ||
          Math.abs(entityArray.length - indexStats.totalEntities) > 100
        ) {
          setIsIndexing(true)
          initializationPromise = api.initializeIndex(entityArray).then((stats) => {
            setIndexStats(stats)
            setIsIndexing(false)
          })
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
    async (query: string, excludedIds: string[] = []) => {
      if (isIndexing) return

      try {
        const api = await getWorkerAPI()
        const results = await api.search(query, excludedIds)
        setSearchResults(results)
        return results
      } catch (error) {
        console.error('Search failed:', error)
        return {
          results: [],
          totalCount: 0,
          groupedByDomain: {},
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
