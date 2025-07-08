// This file contains the worker code as a string to support IIFE builds
export const entitySearchWorkerCode = `
/* eslint-disable @typescript-eslint/no-explicit-any */
importScripts('https://cdn.jsdelivr.net/npm/flexsearch@0.7.31/dist/flexsearch.bundle.js');
importScripts('https://unpkg.com/comlink@4.4.1/dist/umd/comlink.js');

// Create search index with optimal settings for entity search
const searchIndex = new FlexSearch.Index({
  tokenize: 'forward',
  threshold: 0,
  resolution: 9,
  cache: true,
});

// Domain-specific indices for faster filtering
const domainIndices = new Map();

// Cache for processed entities
let entityCache = new Map();

// Helper to get searchable text from entity
function getSearchableText(entity) {
  const parts = [
    entity.entity_id,
    entity.attributes.friendly_name || '',
    entity.state,
    getDomain(entity.entity_id),
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

// Helper to extract domain from entity_id
function getDomain(entityId) {
  return entityId.split('.')[0];
}

// System domains to filter out
const SYSTEM_DOMAINS = ['persistent_notification', 'person', 'sun', 'zone'];

const api = {
  // Initialize the search index with entities
  async initializeIndex(entities) {
    console.time('Index initialization');

    // Clear existing data
    entityCache.clear();
    domainIndices.clear();

    // Process entities in chunks to avoid blocking
    const CHUNK_SIZE = 500;
    for (let i = 0; i < entities.length; i += CHUNK_SIZE) {
      const chunk = entities.slice(i, i + CHUNK_SIZE);

      for (const entity of chunk) {
        // Skip system domains
        const domain = getDomain(entity.entity_id);
        if (SYSTEM_DOMAINS.includes(domain)) continue;

        // Cache entity
        entityCache.set(entity.entity_id, entity);

        // Index for search
        searchIndex.add(entity.entity_id, getSearchableText(entity));

        // Index by domain
        if (!domainIndices.has(domain)) {
          domainIndices.set(domain, new Set());
        }
        domainIndices.get(domain).add(entity.entity_id);
      }

      // Yield to prevent blocking
      if (i % 1000 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    console.timeEnd('Index initialization');
    return {
      totalEntities: entityCache.size,
      domains: Array.from(domainIndices.keys()).sort(),
    };
  },

  // Search entities with query
  async search(query, excludedIds = [], limit = 100) {
    console.time('Search');

    const excludeSet = new Set(excludedIds);
    let results = [];

    if (!query || query.trim() === '') {
      // For empty query, return a limited set of entities grouped by domain
      const domainResults = new Map();
      const maxPerDomain = 10;
      
      // Get a sample from each domain
      for (const [domain, entityIds] of domainIndices.entries()) {
        const domainEntities = [];
        let count = 0;
        
        for (const id of entityIds) {
          if (excludeSet.has(id)) continue;
          const entity = entityCache.get(id);
          if (entity) {
            domainEntities.push(entity);
            count++;
            if (count >= maxPerDomain) break;
          }
        }
        
        if (domainEntities.length > 0) {
          domainResults.set(domain, domainEntities);
        }
      }
      
      // Flatten results
      for (const entities of domainResults.values()) {
        results.push(...entities);
      }
    } else {
      // Search using FlexSearch with limit
      const searchResults = searchIndex.search(query.toLowerCase(), { limit: limit });

      // Convert search results to entities
      results = searchResults
        .map((id) => entityCache.get(id))
        .filter(
          (entity) =>
            entity !== undefined && !excludeSet.has(entity.entity_id)
        );
    }

    // Group by domain
    const groupedByDomain = {};
    for (const entity of results) {
      const domain = getDomain(entity.entity_id);
      if (!groupedByDomain[domain]) {
        groupedByDomain[domain] = [];
      }
      groupedByDomain[domain].push(entity);
    }

    // Sort entities within each domain
    for (const domain in groupedByDomain) {
      groupedByDomain[domain].sort((a, b) => {
        const aName = a.attributes.friendly_name || a.entity_id;
        const bName = b.attributes.friendly_name || b.entity_id;
        return aName.localeCompare(bName);
      });
    }

    console.timeEnd('Search');

    return {
      results,
      totalCount: results.length,
      groupedByDomain,
      totalEntities: entityCache.size,
    };
  },

  // Get entities by domain
  async getEntitiesByDomain(domain, excludedIds = []) {
    const excludeSet = new Set(excludedIds);
    const entityIds = domainIndices.get(domain) || new Set();

    return Array.from(entityIds)
      .map((id) => entityCache.get(id))
      .filter(
        (entity) => entity !== undefined && !excludeSet.has(entity.entity_id)
      )
      .sort((a, b) => {
        const aName = a.attributes.friendly_name || a.entity_id;
        const bName = b.attributes.friendly_name || b.entity_id;
        return aName.localeCompare(bName);
      });
  },

  // Get available domains
  async getDomains() {
    return Array.from(domainIndices.keys()).sort();
  },

  // Update single entity
  async updateEntity(entity) {
    const domain = getDomain(entity.entity_id);

    // Skip system domains
    if (SYSTEM_DOMAINS.includes(domain)) return;

    // Update cache
    entityCache.set(entity.entity_id, entity);

    // Update search index
    searchIndex.update(entity.entity_id, getSearchableText(entity));

    // Update domain index
    if (!domainIndices.has(domain)) {
      domainIndices.set(domain, new Set());
    }
    domainIndices.get(domain).add(entity.entity_id);
  },

  // Remove entity
  async removeEntity(entityId) {
    const domain = getDomain(entityId);

    // Remove from cache
    entityCache.delete(entityId);

    // Remove from search index
    searchIndex.remove(entityId);

    // Remove from domain index
    domainIndices.get(domain)?.delete(entityId);
  },

  // Get entity count
  async getEntityCount() {
    return entityCache.size;
  },
};

Comlink.expose(api);
`
