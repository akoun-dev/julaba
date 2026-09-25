import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Package } from 'lucide-react'
import { AppEmpty, AppError, AppLoading } from '../app-states'

// MODE-1008 — kit d'états UI partagés (miroir bo-ui.tsx). L'environnement
// vitest du dépôt est `node` (vitest.config.mts) SANS jsdom ni
// @testing-library : la suite vérifie donc le rendu SSR réel des composants
// via renderToStaticMarkup (attributs role/class/texte), et le câblage du
// clic via les props capturées sur le Button rendu (le onClick passé par
// AppError EST la fonction invoquée par l'écran au clic).

const buttonCaptures = vi.hoisted(() => ({
  list: [] as Array<{ onClick?: () => void; [key: string]: unknown }>,
}))

vi.mock('@/components/ui/button', async () => {
  const React = await import('react')
  return {
    Button: (props: { onClick?: () => void; [key: string]: unknown }) => {
      buttonCaptures.list.push(props)
      const { children, ...rest } = props
      return React.createElement(
        'button',
        rest as React.ButtonHTMLAttributes<HTMLButtonElement>,
        children as React.ReactNode,
      )
    },
  }
})

const onRetrySpy = vi.fn()

const html = (node: ReactNode): string => renderToStaticMarkup(createElement('div', null, node))

describe('AppLoading', () => {
  it('rend role="status" aria-live="polite" avec le label par défaut « Chargement… »', () => {
    const out = html(createElement(AppLoading))
    expect(out).toContain('role="status"')
    expect(out).toContain('aria-live="polite"')
    expect(out).toContain('Chargement…')
  })

  it('rend un label personnalisé + le spinner animate-spin', () => {
    const out = html(createElement(AppLoading, { label: 'Je regarde tes achats...' }))
    expect(out).toContain('Je regarde tes achats...')
    expect(out).not.toContain('Chargement…')
    expect(out).toContain('animate-spin')
  })

  it('soleilMode grossit le texte (text-base), sinon taille héritée', () => {
    expect(html(createElement(AppLoading, { soleilMode: true }))).toContain('text-base')
    expect(html(createElement(AppLoading))).not.toContain('text-base')
  })
})

describe('AppError', () => {
  beforeEach(() => {
    buttonCaptures.list.length = 0
    onRetrySpy.mockClear()
  })

  it('rend role="alert" avec le message, sans bouton si onRetry absent', () => {
    const out = html(createElement(AppError, { message: 'Impossible de charger les ventes' }))
    expect(out).toContain('role="alert"')
    expect(out).toContain('Impossible de charger les ventes')
    expect(out).not.toContain('<button')
  })

  it('rend le bouton « Réessayer » par défaut quand onRetry est fourni', () => {
    const out = html(createElement(AppError, { message: 'Erreur', onRetry: () => {} }))
    expect(out).toContain('<button')
    expect(out).toContain('Réessayer')
  })

  it('rend le retryLabel personnalisé', () => {
    const out = html(createElement(AppError, { message: 'Erreur', onRetry: () => {}, retryLabel: 'Recharger' }))
    expect(out).toContain('Recharger')
    expect(out).not.toContain('Réessayer')
  })

  it('appelle onRetry au clic (onClick passé au Button = onRetry)', () => {
    html(createElement(AppError, { message: 'Erreur', onRetry: onRetrySpy }))
    const clicked = buttonCaptures.list.find((p) => typeof p.onClick === 'function')
    expect(clicked).toBeDefined()
    clicked?.onClick?.()
    expect(onRetrySpy).toHaveBeenCalledTimes(1)
  })

  it('rend la description et grossit le texte en soleilMode', () => {
    const out = html(createElement(AppError, {
      message: 'Impossible de charger les ventes',
      description: 'Vérifiez votre connexion',
      soleilMode: true,
    }))
    expect(out).toContain('Vérifiez votre connexion')
    expect(out).toContain('text-base')
    expect(out).toContain('text-sm')
  })
})

describe('AppEmpty', () => {
  it('rend titre + description + icône + action', () => {
    const out = html(createElement(AppEmpty, {
      icon: Package,
      title: 'Aucune vente pour cette période',
      description: 'Essayez de élargir la recherche.',
      action: createElement('button', { type: 'button' }, 'Déclarer une récolte'),
    }))
    expect(out).toContain('<svg')
    expect(out).toContain('Aucune vente pour cette période')
    expect(out).toContain('Essayez de élargir la recherche.')
    expect(out).toContain('Déclarer une récolte')
  })

  it('sans description ni icône, ne rend que le titre', () => {
    const out = html(createElement(AppEmpty, { title: 'Aucun cycle terminé pour le moment.' }))
    expect(out).toContain('Aucun cycle terminé pour le moment.')
    expect(out).not.toContain('<svg')
  })

  it('soleilMode grossit le titre (text-base), sinon text-sm', () => {
    expect(html(createElement(AppEmpty, { title: 'X', soleilMode: true }))).toContain('text-base')
    expect(html(createElement(AppEmpty, { title: 'X' }))).toContain('text-sm')
  })
})
