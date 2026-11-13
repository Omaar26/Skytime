import { useEffect, useState } from 'react'
import { Check, Crosshair, LocateFixed } from 'lucide-react'

export default function TargetSelector({ targets, target, onSelect, loading }) {
  const [ra, setRa] = useState(target.ra)
  const [dec, setDec] = useState(target.dec)
  const [validation, setValidation] = useState('')

  useEffect(() => {
    setRa(target.ra)
    setDec(target.dec)
  }, [target.ra, target.dec])

  const selectPreset = (next) => {
    setValidation('')
    onSelect(next, true)
  }

  const loadCoordinates = (event) => {
    event.preventDefault()
    const raDegrees = Number(ra)
    const decDegrees = Number(dec)
    if (!Number.isFinite(raDegrees) || raDegrees < 0 || raDegrees > 360) {
      setValidation('RA must be decimal degrees from 0 to 360.')
      return
    }
    if (!Number.isFinite(decDegrees) || decDegrees < -90 || decDegrees > 90) {
      setValidation('Dec must be decimal degrees from -90 to 90.')
      return
    }
    setValidation('')
    onSelect({ id: 'custom', name: 'Custom sky patch', ra: raDegrees, dec: decDegrees, fov: 0.1, type: 'User-defined coordinates', distance: 'Uncatalogued', constellation: 'Field of view', color: '#70d7e8' }, false)
  }

  return (
    <section className="panel target-panel">
      <div className="panel-heading">
        <div className="heading-icon"><Crosshair size={16} /></div>
        <div>
          <span className="eyebrow">MISSION CATALOG</span>
          <h2>Select a target</h2>
        </div>
        {loading && <span className="subtle-label">SYNCING</span>}
      </div>
      <div className="target-card-list">
        {targets.map((item, index) => {
          const selected = item.id === target.id
          return (
            <button type="button" className={`target-card ${selected ? 'selected' : ''}`} onClick={() => selectPreset(item)} key={item.id} aria-pressed={selected}>
              <span className="target-index">0{index + 1}</span>
              <span className="target-card-copy"><strong>{item.name}</strong><small>{item.ra} <i>/</i> {item.dec}</small></span>
              <span className="target-select-mark">{selected && <Check size={13} />}</span>
            </button>
          )
        })}
      </div>
      <form className="coordinate-form" onSubmit={loadCoordinates}>
        <div className="coordinate-title">
          <span className="field-label">CUSTOM COORDINATES</span>
          <span className="coordinate-system">J2000 / ICRS</span>
        </div>
        <div className="coordinate-inputs">
          <label>
            <span>RA</span>
            <input aria-label="Right ascension" value={ra} onChange={(event) => setRa(event.target.value)} placeholder="degrees, 0–360" />
          </label>
          <label>
            <span>DEC</span>
            <input aria-label="Declination" value={dec} onChange={(event) => setDec(event.target.value)} placeholder="degrees, -90–90" />
          </label>
        </div>
        {validation && <p className="validation-message" role="alert">{validation}</p>}
        <button className="load-button" type="submit"><LocateFixed size={15} /> LOAD SKY PATCH</button>
      </form>
    </section>
  )
}
