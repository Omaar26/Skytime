import { AlertTriangle, Check, CircleDot, Cpu, Database, Radio, Satellite } from 'lucide-react'
import SpectralAnalyzer from './SpectralAnalyzer.jsx'

export default function TelemetrySidebar({ target }) {
  const statusItems = [
    { name: 'Focal plane array', detail: 'Operational', icon: Cpu, state: 'good' },
    { name: 'Infrared detectors', detail: '102 / 102 online', icon: Radio, state: 'good' },
    { name: 'Downlink buffer', detail: '68% capacity', icon: Database, state: 'normal' },
  ]

  return (
    <aside className="telemetry-column">
      <section className="panel telemetry-panel">
        <div className="panel-heading">
          <div className="heading-icon"><Satellite size={16} /></div>
          <div><span className="eyebrow">SPACECRAFT TELEMETRY</span><h2>Instrument health</h2></div>
          <span className="telemetry-live"><i /></span>
        </div>
        <div className="health-score"><span>MISSION SYSTEMS</span><strong>98.7<span>%</span></strong></div>
        <div className="health-bar"><i /></div>
        <div className="detector-list">
          {statusItems.map(({ name, detail, icon: Icon, state }) => (
            <div className="detector-item" key={name}>
              <span className="detector-icon"><Icon size={14} /></span>
              <span className="detector-copy"><strong>{name}</strong><small>{detail}</small></span>
              {state === 'good' ? <Check className="detector-check" size={14} /> : <span className="normal-state"><CircleDot size={11} /> NOMINAL</span>}
            </div>
          ))}
        </div>
        <div className="contamination-alert">
          <div className="alert-icon"><AlertTriangle size={14} /></div>
          <div><strong>Contamination monitor</strong><span>Low-level zodiacal light detected</span></div>
          <span className="alert-level">LOW</span>
        </div>
      </section>
      <SpectralAnalyzer target={target} />
      <section className="mission-note">
        <span className="note-kicker">MISSION NOTE // 04.18</span>
        <p>Five epochs aligned. Compare temporal shifts to identify proper motion and infrared variability.</p>
        <span className="note-signature">SPHEREx SCIENCE OPERATIONS</span>
      </section>
    </aside>
  )
}
