import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { 
  Dialog, 
  DialogTrigger, 
  DialogPortal, 
  DialogOverlay, 
  DialogContent, 
  DialogTitle, 
  DialogDescription,
  DialogClose,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
} from '~/components/ui'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const [switchChecked, setSwitchChecked] = useState(false)

  return (
    <div style={{ padding: '20px' }}>
      <h1>Liebe Dashboard</h1>
      <p>Welcome to your Home Assistant custom dashboard.</p>
      
      <div style={{ marginTop: '40px' }}>
        <h2>Radix UI Components Demo</h2>
        
        {/* Switch Example */}
        <div style={{ marginTop: '20px' }}>
          <h3>Switch Component</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Switch 
              checked={switchChecked}
              onCheckedChange={setSwitchChecked}
              id="example-switch"
            />
            <label htmlFor="example-switch">
              Toggle me ({switchChecked ? 'ON' : 'OFF'})
            </label>
          </div>
        </div>

        {/* Dialog Example */}
        <div style={{ marginTop: '20px' }}>
          <h3>Dialog Component</h3>
          <Dialog>
            <DialogTrigger asChild>
              <button>Open Dialog</button>
            </DialogTrigger>
            <DialogPortal>
              <DialogOverlay style={{
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                position: 'fixed',
                inset: 0,
              }} />
              <DialogContent style={{
                backgroundColor: 'white',
                borderRadius: '6px',
                boxShadow: '0 10px 38px -10px rgba(0, 0, 0, 0.35)',
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '90vw',
                maxWidth: '450px',
                padding: '25px',
              }}>
                <DialogTitle>Radix UI Dialog</DialogTitle>
                <DialogDescription style={{ marginTop: '10px', marginBottom: '20px' }}>
                  This is an example of a Radix UI dialog component with default styling.
                </DialogDescription>
                <DialogClose asChild>
                  <button style={{ marginTop: '10px' }}>Close</button>
                </DialogClose>
              </DialogContent>
            </DialogPortal>
          </Dialog>
        </div>

        {/* Tabs Example */}
        <div style={{ marginTop: '20px' }}>
          <h3>Tabs Component</h3>
          <Tabs defaultValue="tab1">
            <TabsList style={{ display: 'flex', gap: '10px' }}>
              <TabsTrigger value="tab1" style={{ padding: '5px 10px', cursor: 'pointer' }}>
                Tab 1
              </TabsTrigger>
              <TabsTrigger value="tab2" style={{ padding: '5px 10px', cursor: 'pointer' }}>
                Tab 2
              </TabsTrigger>
              <TabsTrigger value="tab3" style={{ padding: '5px 10px', cursor: 'pointer' }}>
                Tab 3
              </TabsTrigger>
            </TabsList>
            <TabsContent value="tab1" style={{ marginTop: '10px' }}>
              <p>Content for Tab 1</p>
            </TabsContent>
            <TabsContent value="tab2" style={{ marginTop: '10px' }}>
              <p>Content for Tab 2</p>
            </TabsContent>
            <TabsContent value="tab3" style={{ marginTop: '10px' }}>
              <p>Content for Tab 3</p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}