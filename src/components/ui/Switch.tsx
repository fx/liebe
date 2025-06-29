import * as SwitchPrimitive from '@radix-ui/react-switch'
import { ComponentPropsWithoutRef, ElementRef, forwardRef } from 'react'

const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    style={{
      width: 42,
      height: 25,
      backgroundColor: props.checked ? '#4CAF50' : '#ccc',
      borderRadius: '9999px',
      position: 'relative',
      cursor: 'pointer',
      WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)',
      transition: 'background-color 100ms',
    }}
    {...props}
  >
    <SwitchPrimitive.Thumb
      style={{
        display: 'block',
        width: 21,
        height: 21,
        backgroundColor: 'white',
        borderRadius: '9999px',
        boxShadow: '0 2px 2px rgba(0, 0, 0, 0.2)',
        transition: 'transform 100ms',
        transform: props.checked ? 'translateX(19px)' : 'translateX(2px)',
        willChange: 'transform',
      }}
    />
  </SwitchPrimitive.Root>
))

Switch.displayName = SwitchPrimitive.Root.displayName

export { Switch }