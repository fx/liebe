@AGENTS.md

## Automated Testing with MCP Browser Tools

### Testing Changes in Home Assistant

When you make changes to the Liebe panel, you can test them directly in Home Assistant using MCP's playwright browser tools:

1. **Build the production bundle**:

   ```bash
   npm run build:ha
   ```

2. **Access the panel using MCP browser tools**:
   - Navigate to Home Assistant URL from `.env.local`
   - Login with credentials if needed
   - Navigate to `/liebe` path
   - Take screenshots or interact with elements
   - Check for console errors

3. **Typical testing flow**:
   ```
   Build → Navigate → Login → Test → Screenshot
   ```

### MCP Browser Tools Workflow

The MCP browser tools provide direct browser automation for testing:

1. **Prerequisites**:
   - Ensure Playwright browser is installed: `npx playwright install chromium`
   - Have `.env.local` configured with Home Assistant credentials

2. **Key MCP browser functions**:
   - `mcp__playwright__browser_navigate` - Go to a URL
   - `mcp__playwright__browser_type` - Fill in text fields
   - `mcp__playwright__browser_click` - Click elements
   - `mcp__playwright__browser_take_screenshot` - Capture visual state
   - `mcp__playwright__browser_snapshot` - Get accessibility tree
   - `mcp__playwright__browser_console_messages` - Check for errors
   - `mcp__playwright__browser_wait_for` - Wait for conditions

3. **Common testing patterns**:

   ```
   // Check if login is needed
   - Look for username/password fields
   - Fill and submit if present

   // Verify panel loaded
   - Check for "Connected" status
   - Look for expected UI elements
   - Take screenshot for visual verification

   // Test interactions
   - Click buttons and check results
   - Verify state changes
   - Check console for errors
   ```

### Environment Variables

The MCP tools read credentials from `.env.local`:

```
HASS_URL=http://homeassistant.local:8123
HASS_USER=dev
HASS_PASSWORD=test
```

### Testing Checklist

When testing changes:

- [ ] Build completed successfully (`npm run build:ha`)
- [ ] Panel loads without errors
- [ ] Connection status shows "Connected"
- [ ] UI elements render correctly
- [ ] Interactions work as expected
- [ ] No console errors
- [ ] Screenshots captured for reference
