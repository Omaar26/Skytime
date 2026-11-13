import { useState } from 'react'
import { Activity, ChevronDown } from 'lucide-react'

const bandLabels = ['0.75', '1.1', '1.6', '2.1', '2.6', '3.2', '3.8', '4.4', '5.0']
const spectra = {
  default: [28, 34, 31, 43, 46, 58, 52, 68, 61],
  cool: [43, 52, 58, 49, 42, 34, 27, 24, 21],
  warm: [18, 24, 29, 42, 56, 68, 74, 81, 88],
}

export default function SpectralAnalyzer({ target }) {
  const [band, setBand] = useState('default')
  const values = spectra[band]
  const points = values.map((value, index) => `${14 + index * 36},${96 - value * 0.76}`).join(' ')
  const areaPath = `M ${points.replaceAll(' ', ' L ')} L 302,96 L 14,96 Z`

  return (
    <section className="panel spectrum-panel">
      <div className="panel-heading compact-heading">
        <div className="heading-icon"><Activity size={16} /></div>
        <div><span className="eyebrow">SPECTRAL SIGNATURE</span><h2>Infrared brightness</h2></div>
        <button className="chart-menu" aria-label="Change spectral profile" onClick={() => setBand((current) => current === 'default' ? 'cool' : current === 'cool' ? 'warm' : 'default')}><ChevronDown size={15} /></button>
      </div>
      <div className="chart-legend"><span><i /> FLUX DENSITY</span><b>μJy</b></div>
      <div className="spectrum-chart">
        <div className="chart-y-labels"><span>80</span><span>40</span><span>0</span></div>
        <svg viewBox="0 0 320 110" role="img" aria-label={`Infrared brightness by spectral band for ${target.name}`}>
          <defs><linearGradient id="spectral-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#0fbad1" stopOpacity=".24" /><stop offset="100%" stopColor="#0fbad1" stopOpacity="0" /></linearGradient></defs>
          {[35, 65, 95].map((y) => <line key={y} x1="14" x2="306" y1={y} y2={y} stroke="rgba(255,255,255,.08)" strokeDasharray="3 5" />)}
          <path d={areaPath} fill="url(#spectral-fill)" />
          <polyline points={points} fill="none" stroke="#16c6db" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {values.map((value, index) => <circle key={index} cx={14 + index * 36} cy={96 - value * 0.76} r="2.7" fill="#061016" stroke="#56e0e8" strokeWidth="1.5" />)}
        </svg>
      </div>
      <div className="chart-x-labels">{bandLabels.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="chart-footer"><span>WAVELENGTH (μm)</span><span>PROFILE <b>{band === 'default' ? 'TARGET' : band.toUpperCase()}</b></span></div>
    </section>
  )
}
