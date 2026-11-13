import { useEffect, useState } from 'react'
import { mockTargets } from '../data/mockTargets.js'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const toId = (name) => name.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// The backend (API_CONTRACT A3) only returns name/ra/dec/fov in decimal degrees.
// Keep the local display extras (colour, constellation, ...) for the known presets,
// but always use the backend's coordinates so frames are requested for the right patch.
function fromBackend(item) {
  const id = item.id || toId(item.name)
  const local = mockTargets.find((preset) => id === preset.id || id.startsWith(`${preset.id}-`))
  return {
    ...(local || {}),
    ...item,
    id: local ? local.id : id,
    name: item.name,
    ra: Number(item.ra),
    dec: Number(item.dec),
    fov: Number(item.fov) || 0.1,
    type: item.objectType || local?.type || 'Sky target',
  }
}

export function useTargetData() {
  const [targets, setTargets] = useState(mockTargets.map((item) => ({ ...item, ra: item.raDegrees, dec: item.decDegrees, fov: 0.1 })))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const loadTargets = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/targets`, { signal: controller.signal })
        if (!response.ok) throw new Error(`Target request failed (${response.status})`)
        const data = await response.json()
        if (!Array.isArray(data) || !data.length) throw new Error('Target service returned an invalid response')
        setTargets(data.map(fromBackend))
        setError('')
      } catch (requestError) {
        if (requestError.name !== 'AbortError') {
          setError('Backend unavailable. Showing the local preview.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    loadTargets()
    return () => controller.abort()
  }, [])

  return { targets, loading, error }
}
