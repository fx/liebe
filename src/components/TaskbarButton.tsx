import React from 'react'
import { Button, IconButton } from '@radix-ui/themes'

interface TaskbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode
  label?: string
  variant?: 'solid' | 'soft' | 'ghost'
  color?: 'gray' | 'green' | 'red'
  showText?: boolean
  ariaLabel: string
  title?: string
}

export const TaskbarButton = React.forwardRef<HTMLButtonElement, TaskbarButtonProps>(
  (
    { icon, label, onClick, variant = 'soft', color, showText, ariaLabel, title, ...props },
    ref
  ) => {
    if (showText && label) {
      return (
        <Button
          ref={ref}
          size="3"
          variant={variant}
          color={color}
          onClick={onClick}
          aria-label={ariaLabel}
          title={title}
          style={{
            width: '100%',
            justifyContent: 'flex-start',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            ...props.style,
          }}
          {...props}
        >
          {icon}
          {label}
        </Button>
      )
    }

    return (
      <IconButton
        ref={ref}
        size="3"
        variant={variant}
        color={color}
        onClick={onClick}
        aria-label={ariaLabel}
        title={title}
        {...props}
      >
        {icon}
      </IconButton>
    )
  }
)

TaskbarButton.displayName = 'TaskbarButton'
