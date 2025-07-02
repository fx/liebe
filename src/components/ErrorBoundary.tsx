import { Component, ErrorInfo, ReactNode } from 'react'
import { Card, Flex, Text, Button, Box, Code, ScrollArea } from '@radix-ui/themes'
import { ExclamationTriangleIcon, ReloadIcon, ChevronDownIcon } from '@radix-ui/react-icons'
import { ErrorDisplay } from './ui/ErrorDisplay'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  showDetails?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  showDetails: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)

    this.setState({
      errorInfo,
    })

    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    })
  }

  toggleDetails = () => {
    this.setState((prev) => ({
      showDetails: !prev.showDetails,
    }))
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // If custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset)
      }

      // Default error UI
      return (
        <Flex
          align="center"
          justify="center"
          style={{ minHeight: '400px', padding: 'var(--space-4)' }}
        >
          <Card variant="classic" style={{ maxWidth: '600px', width: '100%' }}>
            <Flex p="4" direction="column" gap="4">
              {/* Error Header */}
              <Flex align="center" gap="3">
                <Box style={{ color: 'var(--red-9)' }}>
                  <ExclamationTriangleIcon width={24} height={24} />
                </Box>
                <Box>
                  <Text size="4" weight="medium">
                    Something went wrong
                  </Text>
                  <Text size="2" color="gray">
                    An unexpected error occurred in this component
                  </Text>
                </Box>
              </Flex>

              {/* Error Message */}
              <Card variant="surface">
                <Box p="3">
                  <Text size="2" color="red" as="div">
                    {this.state.error.message || 'Unknown error'}
                  </Text>
                </Box>
              </Card>

              {/* Actions */}
              <Flex gap="2" align="center">
                <Button onClick={this.handleReset} variant="solid">
                  <ReloadIcon />
                  Try Again
                </Button>
                {(this.props.showDetails !== false || process.env.NODE_ENV === 'development') && (
                  <Button onClick={this.toggleDetails} variant="soft" color="gray">
                    <ChevronDownIcon
                      style={{
                        transform: this.state.showDetails ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                      }}
                    />
                    {this.state.showDetails ? 'Hide' : 'Show'} Details
                  </Button>
                )}
              </Flex>

              {/* Error Details (collapsible) */}
              {this.state.showDetails && this.state.errorInfo && (
                <Card variant="surface">
                  <ScrollArea style={{ maxHeight: '300px' }}>
                    <Box p="3">
                      <Flex direction="column" gap="3">
                        <Box>
                          <Text size="2" weight="medium" as="div" mb="1">
                            Stack Trace:
                          </Text>
                          <Code size="1" variant="ghost" style={{ whiteSpace: 'pre-wrap' }}>
                            {this.state.error.stack}
                          </Code>
                        </Box>
                        <Box>
                          <Text size="2" weight="medium" as="div" mb="1">
                            Component Stack:
                          </Text>
                          <Code size="1" variant="ghost" style={{ whiteSpace: 'pre-wrap' }}>
                            {this.state.errorInfo.componentStack}
                          </Code>
                        </Box>
                      </Flex>
                    </Box>
                  </ScrollArea>
                </Card>
              )}

              {/* Help Text */}
              <Text size="1" color="gray" align="center">
                If this error persists, try refreshing the page or contact support.
              </Text>
            </Flex>
          </Card>
        </Flex>
      )
    }

    return this.props.children
  }
}

// Convenience hook for using error boundaries with function components
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`

  return WrappedComponent
}

// Simple error boundary for entity cards
export const EntityErrorBoundary: React.FC<{ children: ReactNode; entityId?: string }> = ({
  children,
  entityId,
}) => {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <ErrorDisplay
          error={error}
          variant="card"
          title={entityId ? `Error loading ${entityId}` : 'Entity Error'}
          onRetry={reset}
        />
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
