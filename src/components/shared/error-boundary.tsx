'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ErrorBoundaryProps = {
  children: ReactNode
  /** Message français à afficher en cas de crash (quoi + quoi faire). */
  fallbackLabel?: string
  /** Clé externe : changer sa valeur force la réinitialisation (retour à l'état normal). */
  resetKey?: unknown
}

type ErrorBoundaryState = {
  hasError: boolean
}

/**
 * Filet de secours racine (I-06 / TRV-NAV-001) : un crash de rendu ne doit
 * JAMAIS laisser une page blanche. Aucun texte technique (stack, message
 * d'erreur brut) n'est exposé à l'utilisateur — uniquement la cause et
 * l'action (copy.md) ; le détail part dans la console pour le diagnostic.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // resetKey externe changée → on recharge l'interface normale.
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    const message = this.props.fallbackLabel ?? 'Une erreur est survenue. Réessayez.'

    return (
      <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-5 bg-background px-6 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
        <p role="alert" className="max-w-sm text-base font-medium text-foreground">
          {message}
        </p>
        <Button
          type="button"
          size="lg"
          onClick={this.handleRetry}
          className="active:scale-[0.97] transition-transform duration-150 ease-out"
        >
          Réessayer
        </Button>
      </div>
    )
  }
}