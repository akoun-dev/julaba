'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { ACTOR_TYPE_COLORS, type MapActorPoint, type MapZonePoint } from './bo-carte-acteurs-types'

const IDENTIFICATEUR_COLOR = '#0ea5e9'
const ABIDJAN_CENTER: [number, number] = [5.3599517, -4.0082563]

// Recenters the map without remounting it whenever the caller asks to fly
// to a different point (e.g. clicking a zone in the "Acteurs par zone" list).
function FlyToTarget({ target }: { target: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, 13, { duration: 0.8 })
  }, [target, map])
  return null
}

export function BoCarteActeursMap({
  actorPoints,
  zonePoints,
  flyTo,
}: {
  actorPoints: MapActorPoint[]
  zonePoints: MapZonePoint[]
  flyTo: [number, number] | null
}) {
  return (
    <MapContainer
      center={ABIDJAN_CENTER}
      zoom={7}
      scrollWheelZoom
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FlyToTarget target={flyTo} />

      {zonePoints.map((z) => (
        <CircleMarker
          key={`zone-${z.zone}`}
          center={[z.lat, z.lng]}
          radius={14}
          pathOptions={{ color: IDENTIFICATEUR_COLOR, fillColor: IDENTIFICATEUR_COLOR, fillOpacity: 0.2, weight: 2, dashArray: '4' }}
        >
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">{z.zone}</p>
              <p>{z.identificateurCount} identificateur{z.identificateurCount > 1 ? 's' : ''}</p>
              <p>{z.actorCount} acteur{z.actorCount > 1 ? 's' : ''}</p>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {actorPoints.map((a) => (
        <CircleMarker
          key={a.id}
          center={[a.lat, a.lng]}
          radius={7}
          pathOptions={{ color: ACTOR_TYPE_COLORS[a.type], fillColor: ACTOR_TYPE_COLORS[a.type], fillOpacity: 0.85, weight: 2 }}
        >
          <Popup>
            <div className="text-xs">
              <p className="font-semibold">{a.name}</p>
              <p className="capitalize">{a.type} · {a.zone}</p>
              <p className="capitalize">{a.status}</p>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
