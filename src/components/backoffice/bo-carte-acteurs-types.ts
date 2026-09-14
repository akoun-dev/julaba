// Shared between bo-carte-acteurs-screen.tsx and bo-carte-acteurs-map.tsx —
// kept in its own file with no leaflet/react-leaflet import so the screen
// can import it statically without dragging leaflet (which touches
// `window` at module-evaluation time) into the server bundle. The map
// component itself is only ever loaded client-side via next/dynamic
// ({ ssr: false }).

export interface MapActorPoint {
  id: string
  name: string
  type: 'marchand' | 'producteur' | 'cooperatif'
  zone: string
  status: string
  lat: number
  lng: number
}

export interface MapZonePoint {
  zone: string
  identificateurCount: number
  actorCount: number
  lat: number
  lng: number
}

export const ACTOR_TYPE_COLORS: Record<MapActorPoint['type'], string> = {
  marchand: '#f97316',
  producteur: '#16a34a',
  cooperatif: '#a855f7',
}
