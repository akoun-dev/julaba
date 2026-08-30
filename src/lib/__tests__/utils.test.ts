import { describe, it, expect } from 'vitest'
import { cn } from '../utils'

describe('utils', () => {
  describe('cn', () => {
    it('devrait retourner une chaîne vide sans arguments', () => {
      expect(cn()).toBe('')
    })

    it('devrait retourner une seule classe inchangée', () => {
      expect(cn('text-red-500')).toBe('text-red-500')
    })

    it('devrait fusionner plusieurs classes', () => {
      expect(cn('flex', 'items-center', 'justify-center')).toBe(
        'flex items-center justify-center'
      )
    })

    it('devrait gérer les classes conditionnelles avec booléens', () => {
      const isActive = true
      const isDisabled = false
      expect(cn('btn', isActive && 'active', isDisabled && 'disabled')).toBe('btn active')
    })

    it('devrait gérer les tableaux de classes', () => {
      expect(cn(['flex', 'items-center'], 'justify-center')).toBe(
        'flex items-center justify-center'
      )
    })

    it('devrait gérer les objets avec valeurs truthy/falsy', () => {
      expect(cn({ 'text-red': true, 'text-blue': false })).toBe('text-red')
    })

    it('devrait fusionner des classes Tailwind conflictuelles (dernière gagne)', () => {
      // Tailwind merge donne la priorité à la dernière classe conflictuelle
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
      expect(cn('flex', 'hidden', 'flex')).toBe('flex')
    })

    it('devrait gérer les valeurs null et undefined', () => {
      expect(cn('flex', null, undefined, 'items-center')).toBe('flex items-center')
    })

    it('devrait gérer les classes dupliquées', () => {
      expect(cn('flex', 'flex', 'flex')).toBe('flex')
    })

    it('devrait mélanger différents types d\'entrées', () => {
      const condition = true
      expect(
        cn(
          'base-class',
          ['array-class'],
          { 'object-class': true, 'ignored-class': false },
          condition && 'conditional-class',
          null,
          undefined
        )
      ).toBe('base-class array-class object-class conditional-class')
    })

    it('devrait préserver l\'ordre des classes non conflictuelles', () => {
      expect(cn('z-10', 'flex', 'text-center')).toBe('z-10 flex text-center')
    })

    it('devrait gérer les chaînes vides', () => {
      expect(cn('', 'flex', '')).toBe('flex')
    })

    it('devrait fusionner correctement padding conflictuel', () => {
      expect(cn('p-4', 'p-2', 'px-3')).toBe('p-2 px-3')
    })

    it('devrait fusionner correctement margin conflictuel', () => {
      expect(cn('m-4', 'm-2')).toBe('m-2')
    })

    it('devrait fusionner correctement width/height', () => {
      expect(cn('w-full', 'w-auto')).toBe('w-auto')
      expect(cn('h-10', 'h-20')).toBe('h-20')
    })
  })
})
