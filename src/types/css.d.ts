/**
 * Vite's `?raw` suffix, which yields a module's file contents as a string.
 *
 * The theme registry loads each theme's stylesheet this way: a side-effecting
 * `import './theme.css'` would apply every registered theme at once, and a
 * theme has to be a string the engine can inject and swap.
 */
declare module '*.css?raw' {
  const content: string
  export default content
}
