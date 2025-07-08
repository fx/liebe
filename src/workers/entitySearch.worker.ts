/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Comlink from 'comlink'
import FlexSearch from 'flexsearch'
import type { HassEntity } from '../store/entityTypes'

// Create search index with optimal settings for entity search
const searchIndex = new (FlexSearch.Index as any)({
  tokenize: 'forward',
  threshold: 0,
  resolution: 9,
  cache: true,
})

// Domain-specific indices for faster filtering
const domainIndices = new Map<string, Set<string>>()

// Cache for processed entities
let entityCache = new Map<string, HassEntity>()

// Helper to get searchable text from entity
function getSearchableText(entity: HassEntity): string {
  const parts = [
    entity.entity_id,
    entity.attributes.friendly_name || '',
    entity.state,
    getDomain(entity.entity_id),
  ]
  return parts.filter(Boolean).join(' ').toLowerCase()
}

// Helper to extract domain from entity_id
function getDomain(entityId: string): string {
  return entityId.split('.')[0]
}

// System domains to filter out
const SYSTEM_DOMAINS = ['persistent_notification', 'person', 'sun', 'zone']

const api = {
  // Initialize the search index with entities
  async initializeIndex(entities: HassEntity[]) {
    console.time('Index initialization')

    // Clear existing data
    entityCache.clear()
    domainIndices.clear()

    // Process entities in chunks to avoid blocking
    const CHUNK_SIZE = 500
    for (let i = 0; i < entities.length; i += CHUNK_SIZE) {
      const chunk = entities.slice(i, i + CHUNK_SIZE)

      for (const entity of chunk) {
        // Skip system domains
        const domain = getDomain(entity.entity_id)
        if (SYSTEM_DOMAINS.includes(domain)) continue

        // Cache entity
        entityCache.set(entity.entity_id, entity)

        // Index for search
        searchIndex.add(entity.entity_id, getSearchableText(entity))

        // Index by domain
        if (!domainIndices.has(domain)) {
          domainIndices.set(domain, new Set())
        }
        domainIndices.get(domain)!.add(entity.entity_id)
      }

      // Yield to prevent blocking
      if (i % 1000 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }

    console.timeEnd('Index initialization')
    return {
      totalEntities: entityCache.size,
      domains: Array.from(domainIndices.keys()).sort(),
    }
  },

  // Search entities with query
  async search(
    query: string,
    excludedIds: string[] = [],
    limit: number = 100
  ): Promise<{
    results: HassEntity[]
    totalCount: number
    groupedByDomain: Record<string, HassEntity[]>
    totalEntities: number
  }> {
    console.time('Search')

    const excludeSet = new Set(excludedIds)
    let results: HassEntity[] = []

    if (!query || query.trim() === '') {
      // For empty query, return a very limited set of entities
      const domainResults = new Map<string, HassEntity[]>()
      const maxPerDomain = 3 // Reduced from 10 to 3
      const maxDomains = 10 // Limit number of domains shown
      let domainCount = 0

      // Get a small sample from each domain
      for (const [domain, entityIds] of domainIndices.entries()) {
        if (domainCount >= maxDomains) break
        
        const domainEntities: HassEntity[] = []
        let count = 0

        for (const id of entityIds) {
          if (excludeSet.has(id)) continue
          const entity = entityCache.get(id)
          if (entity) {
            domainEntities.push(entity)
            count++
            if (count >= maxPerDomain) break
          }
        }

        if (domainEntities.length > 0) {
          domainResults.set(domain, domainEntities)
          domainCount++
        }
      }

      // Flatten results
      for (const entities of domainResults.values()) {
        results.push(...entities)
      }
    } else {
      // Search using FlexSearch with limit
      const searchResults = searchIndex.search(query.toLowerCase(), { limit })

      // Convert search results to entities
      results = searchResults
        .map((id: any) => entityCache.get(id as string))
        .filter(
          (entity: HassEntity | undefined): entity is HassEntity =>
            entity !== undefined && !excludeSet.has(entity.entity_id)
        )
    }

    // Group by domain
    const groupedByDomain: Record<string, HassEntity[]> = {}
    for (const entity of results) {
      const domain = getDomain(entity.entity_id)
      if (!groupedByDomain[domain]) {
        groupedByDomain[domain] = []
      }
      groupedByDomain[domain].push(entity)
    }

    // Sort entities within each domain
    for (const domain in groupedByDomain) {
      groupedByDomain[domain].sort((a, b) => {
        const aName = a.attributes.friendly_name || a.entity_id
        const bName = b.attributes.friendly_name || b.entity_id
        return aName.localeCompare(bName)
      })
    }

    console.timeEnd('Search')

    return {
      results,
      totalCount: results.length,
      groupedByDomain,
      totalEntities: entityCache.size,
    }
  },

  // Get entities by domain
  async getEntitiesByDomain(domain: string, excludedIds: string[] = []): Promise<HassEntity[]> {
    const excludeSet = new Set(excludedIds)
    const entityIds = domainIndices.get(domain) || new Set()

    return Array.from(entityIds)
      .map((id) => entityCache.get(id))
      .filter(
        (entity): entity is HassEntity => entity !== undefined && !excludeSet.has(entity.entity_id)
      )
      .sort((a, b) => {
        const aName = a.attributes.friendly_name || a.entity_id
        const bName = b.attributes.friendly_name || b.entity_id
        return aName.localeCompare(bName)
      })
  },

  // Get available domains
  async getDomains(): Promise<string[]> {
    return Array.from(domainIndices.keys()).sort()
  },

  // Update single entity
  async updateEntity(entity: HassEntity) {
    const domain = getDomain(entity.entity_id)

    // Skip system domains
    if (SYSTEM_DOMAINS.includes(domain)) return

    // Update cache
    entityCache.set(entity.entity_id, entity)

    // Update search index
    searchIndex.update(entity.entity_id, getSearchableText(entity))

    // Update domain index
    if (!domainIndices.has(domain)) {
      domainIndices.set(domain, new Set())
    }
    domainIndices.get(domain)!.add(entity.entity_id)
  },

  // Remove entity
  async removeEntity(entityId: string) {
    const domain = getDomain(entityId)

    // Remove from cache
    entityCache.delete(entityId)

    // Remove from search index
    searchIndex.remove(entityId)

    // Remove from domain index
    domainIndices.get(domain)?.delete(entityId)
  },

  // Get entity count
  async getEntityCount(): Promise<number> {
    return entityCache.size
  },
}

Comlink.expose(api)
