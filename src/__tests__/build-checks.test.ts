import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

describe('Production Build Checks', () => {
  let panelContent: string

  beforeAll(() => {
    // Build the production panel if it doesn't exist
    const panelPath = resolve(__dirname, '../../dist/panel.js')
    if (!existsSync(panelPath)) {
      console.log('Building production panel...')
      execSync('npm run build:ha:prod', { 
        cwd: resolve(__dirname, '../..'),
        stdio: 'inherit' 
      })
    }
    
    // Read the built panel.js
    panelContent = readFileSync(panelPath, 'utf-8')
  })

  it('should not contain alert() calls in production build', () => {
    // Check for any alert() calls
    const alertPattern = /alert\s*\(/g
    const matches = panelContent.match(alertPattern)
    
    if (matches) {
      // Find context around each alert
      matches.forEach(match => {
        const index = panelContent.indexOf(match)
        const context = panelContent.substring(
          Math.max(0, index - 100), 
          Math.min(panelContent.length, index + 100)
        )
        console.error(`Found alert() at index ${index}:`, context)
      })
    }
    
    expect(matches).toBeNull()
  })

  it('should not contain alert(0) specifically', () => {
    // Check specifically for alert(0)
    const alert0Pattern = /alert\s*\(\s*0\s*\)/g
    const matches = panelContent.match(alert0Pattern)
    
    expect(matches).toBeNull()
  })

  it.todo('should exclude test routes from production build', () => {
    // TODO: Test routes should be excluded from production builds
    // This test is disabled until we implement proper route filtering
    const testConsolePattern = /console\.log\s*\(\s*['"]Configuration exported/g
    const matches = panelContent.match(testConsolePattern)
    
    expect(matches).toBeNull()
  })

  it('should not contain debugger statements', () => {
    const debuggerPattern = /\bdebugger\b/g
    const matches = panelContent.match(debuggerPattern)
    
    expect(matches).toBeNull()
  })
})