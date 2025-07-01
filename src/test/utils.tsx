import { render, RenderOptions } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import '@radix-ui/themes/styles.css'

// Custom render function that includes providers
export function renderWithTheme(ui: React.ReactElement, options?: RenderOptions) {
  return render(ui, {
    wrapper: ({ children }) => <Theme>{children}</Theme>,
    ...options,
  })
}

// Re-export everything from testing library
export * from '@testing-library/react'
export { renderWithTheme as render }
