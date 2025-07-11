/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { Route as rootRouteImport } from './routes/__root'
import { Route as _rootTestPerformanceRouteImport } from './routes/__root.test.performance'
import { Route as TestStoreRouteImport } from './routes/test-store'
import { Route as SlugRouteImport } from './routes/$slug'
import { Route as SplatRouteImport } from './routes/$'
import { Route as IndexRouteImport } from './routes/index'

const _rootTestPerformanceRoute = _rootTestPerformanceRouteImport.update({
  id: '/__root/test/performance',
  path: '/test/performance',
  getParentRoute: () => rootRouteImport,
} as any)
const TestStoreRoute = TestStoreRouteImport.update({
  id: '/test-store',
  path: '/test-store',
  getParentRoute: () => rootRouteImport,
} as any)
const SlugRoute = SlugRouteImport.update({
  id: '/$slug',
  path: '/$slug',
  getParentRoute: () => rootRouteImport,
} as any)
const SplatRoute = SplatRouteImport.update({
  id: '/$',
  path: '/$',
  getParentRoute: () => rootRouteImport,
} as any)
const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/$': typeof SplatRoute
  '/$slug': typeof SlugRoute
  '/test-store': typeof TestStoreRoute
  '/test/performance': typeof _rootTestPerformanceRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/$': typeof SplatRoute
  '/$slug': typeof SlugRoute
  '/test-store': typeof TestStoreRoute
  '/test/performance': typeof _rootTestPerformanceRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/$': typeof SplatRoute
  '/$slug': typeof SlugRoute
  '/test-store': typeof TestStoreRoute
  '/__root/test/performance': typeof _rootTestPerformanceRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/$' | '/$slug' | '/test-store' | '/test/performance'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/$' | '/$slug' | '/test-store' | '/test/performance'
  id:
    | '__root__'
    | '/'
    | '/$'
    | '/$slug'
    | '/test-store'
    | '/__root/test/performance'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  SplatRoute: typeof SplatRoute
  SlugRoute: typeof SlugRoute
  TestStoreRoute: typeof TestStoreRoute
  _rootTestPerformanceRoute: typeof _rootTestPerformanceRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/__root/test/performance': {
      id: '/__root/test/performance'
      path: '/test/performance'
      fullPath: '/test/performance'
      preLoaderRoute: typeof _rootTestPerformanceRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/test-store': {
      id: '/test-store'
      path: '/test-store'
      fullPath: '/test-store'
      preLoaderRoute: typeof TestStoreRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/$slug': {
      id: '/$slug'
      path: '/$slug'
      fullPath: '/$slug'
      preLoaderRoute: typeof SlugRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/$': {
      id: '/$'
      path: '/$'
      fullPath: '/$'
      preLoaderRoute: typeof SplatRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexRouteImport
      parentRoute: typeof rootRouteImport
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  SplatRoute: SplatRoute,
  SlugRoute: SlugRoute,
  TestStoreRoute: TestStoreRoute,
  _rootTestPerformanceRoute: _rootTestPerformanceRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
