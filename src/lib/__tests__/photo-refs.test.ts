import { describe, expect, it } from 'vitest'

// PF-04 — module pur de résolution des références photo (photo-refs.ts) :
//   - parsePhotosJson tolérant (array / JSON string / corrompu / non-string) ;
//   - détection des trois formes coexistantes (DataURL / storage ref / http) ;
//   - collecte dédupliquée et substitution batch sans jamais crasher.

import {
  applySignedUrls,
  collectStorageRefs,
  isDataUrl,
  isStorageRef,
  parsePhotosJson,
} from '../producteur/photo-refs'

const DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICAgKDA8MCgsOCwgIDRENDg8QEBEQCgsSExIQEA8QEBD/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='
const REF = 'harvest-photos/prod-1/abc-123.jpg'
const OTHER_REF = 'harvest-photos/prod-2/def-456.png'
const HTTP_URL = 'https://example.com/photo.jpg'

describe('photo-refs (PF-04) — détection des formes', () => {
  it('reconnaît une DataURL', () => {
    expect(isDataUrl(DATA_URL)).toBe(true)
    expect(isDataUrl(REF)).toBe(false)
  })

  it('reconnaît une référence harvest-photos (et seulement celle-là)', () => {
    expect(isStorageRef(REF)).toBe(true)
    expect(isStorageRef('actor-photos/prod-1/x.jpg')).toBe(false)
    expect(isStorageRef(DATA_URL)).toBe(false)
    expect(isStorageRef(HTTP_URL)).toBe(false)
  })
})

describe('photo-refs (PF-04) — parsePhotosJson tolérant', () => {
  it('accepte un array de strings', () => {
    expect(parsePhotosJson([REF, DATA_URL])).toEqual([REF, DATA_URL])
  })

  it('accepte une string JSON (format historique de la colonne)', () => {
    expect(parsePhotosJson(JSON.stringify([REF]))).toEqual([REF])
  })

  it('filtre les entrées non-string', () => {
    expect(parsePhotosJson([REF, 42, null])).toEqual([REF])
  })

  it('retourne [] sur JSON corrompu (jamais de 500 au GET)', () => {
    expect(parsePhotosJson('{invalide')).toEqual([])
  })

  it('retourne [] sur null / undefined / objet', () => {
    expect(parsePhotosJson(null)).toEqual([])
    expect(parsePhotosJson(undefined)).toEqual([])
    expect(parsePhotosJson({ photos: REF })).toEqual([])
  })
})

describe('photo-refs (PF-04) — collecte et substitution', () => {
  it('collecte UNIQUEMENT les refs storage, dédupliquées, ordre stable', () => {
    const refs = collectStorageRefs([DATA_URL, REF, HTTP_URL, OTHER_REF, REF])
    expect(refs).toEqual([REF, OTHER_REF])
  })

  it('applique les URLs signées aux refs, laisse DataURL et http intacts', () => {
    const signed = new Map([[REF, 'https://signed.example/abc?token=1']])
    const out = applySignedUrls([REF, DATA_URL, HTTP_URL, OTHER_REF], signed)
    expect(out[0]).toBe('https://signed.example/abc?token=1')
    expect(out[1]).toBe(DATA_URL)
    expect(out[2]).toBe(HTTP_URL)
    // Référence sans URL signée : reste sous forme brute (fallback visuel),
    // jamais de crash d'affichage.
    expect(out[3]).toBe(OTHER_REF)
  })

  it('substitution vide → tableau inchangé', () => {
    const photos = [DATA_URL, REF]
    expect(applySignedUrls(photos, new Map())).toEqual(photos)
  })
})
