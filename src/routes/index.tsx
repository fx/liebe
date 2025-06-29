import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Liebe Dashboard</h1>
      <p>Welcome to your Home Assistant custom dashboard.</p>
    </div>
  )
}