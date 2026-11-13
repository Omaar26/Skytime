import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Aperture, ArrowDown, ArrowRight, ArrowUpRight, Compass, Orbit, ScanLine, Sparkles } from 'lucide-react'
import BlinkPlayer from './components/BlinkPlayer.jsx'
import CelestialField from './components/CelestialField.jsx'
import Navbar from './components/Navbar.jsx'
import TargetSelector from './components/TargetSelector.jsx'
import TelemetrySidebar from './components/TelemetrySidebar.jsx'
import { useTargetData } from './hooks/useTargetData.js'
import { createCustomTarget } from './data/mockTargets.js'

function resolveInitialTarget(targets) {
  const params = new URLSearchParams(window.location.search)
  const preset = targets.find((item) => item.id === params.get('target'))
  if (preset) return preset
  if (params.get('ra') && params.get('dec')) return createCustomTarget(Number(params.get('ra')), Number(params.get('dec')), Number(params.get('fov')) || 0.1)
  return targets[0]
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function App() {
  const { targets, loading, error } = useTargetData()
  const initialTarget = useMemo(() => resolveInitialTarget(targets), [targets])
  const [target, setTarget] = useState(initialTarget)
  const [theme, setTheme] = useState('dark')
  const [frameInfo, setFrameInfo] = useState(null)
  const handleFrames = useCallback((info) => setFrameInfo(info), [])
  const simulated = !frameInfo || frameInfo.simulated

  useEffect(() => {
    setTarget(initialTarget)
  }, [initialTarget])

  const selectTarget = (nextTarget, isPreset) => {
    setTarget(nextTarget)
    const url = new URL(window.location.href)
    url.searchParams.set('ra', nextTarget.ra)
    url.searchParams.set('dec', nextTarget.dec)
    url.searchParams.set('fov', nextTarget.fov || 0.1)
    if (isPreset) url.searchParams.set('target', nextTarget.id)
    else url.searchParams.delete('target')
    window.history.replaceState({}, '', url)
  }

  return (
    <div className={`app-shell ${theme === 'light' ? 'light-observatory' : ''}`} data-theme={theme}>
      <Navbar target={target} theme={theme} onThemeToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} />

      <main>
        <section className="hero-section" id="home">
          <CelestialField theme={theme} />
          <div className="hero-vignette" />
          <div className="hero-content">
            <motion.div className="hero-topline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
              <span>(SPHEREx MISSION) <i>//</i> ALL-SKY INFRARED SURVEY</span>
              <span className="hero-index">MISSION 001 <b>—</b> FULL SKY</span>
            </motion.div>

            <motion.div className="hero-heading" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.85, delay: 0.12 }}>
              <h1>SPHEREx<span>,</span></h1>
              <div className="hero-title-second">
                <span className="title-rule" />
                <h2>mapped in <em>3D.</em></h2>
                <Orbit className="hero-orbit-icon" strokeWidth={1} />
              </div>
            </motion.div>

            <div className="hero-bottom">
              <motion.div className="hero-description" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.32 }}>
                <span className="hero-description-mark"><Aperture size={15} /></span>
                <p>Across a six-month all-sky infrared survey, SPHEREx maps the cosmos in 102 spectral bands, revealing moving brown dwarfs, variable stars, and the structure of our galaxy.</p>
              </motion.div>
              <motion.div className="hero-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.44 }}>
                <button className="hero-primary" onClick={() => scrollToSection('explorer')}>Launch explorer <ArrowRight size={16} /></button>
                <button className="hero-secondary" onClick={() => scrollToSection('target-catalog')}>View 5 targets <ArrowUpRight size={15} /></button>
              </motion.div>
            </div>

            <div className="hero-footline">
              <span><i className="hero-live-dot" /> OBSERVATORY ONLINE</span>
              <span>ALL SKY <b>×</b> 102 BANDS <b>×</b> 5 TARGETS</span>
              <button onClick={() => scrollToSection('explorer')} aria-label="Scroll to the explorer"><ArrowDown size={15} /></button>
            </div>
          </div>
        </section>

        <section className="dashboard-section" id="explorer">
          <div className="dashboard-inner">
            <motion.div className="dashboard-heading" initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: 0.55 }}>
              <div>
                <div className="section-kicker"><span>01</span><i /> TIME-DOMAIN EXPLORER</div>
                <h2>One sky. <em>Many moments.</em></h2>
                <p>Move through infrared epochs and inspect the changing universe.</p>
              </div>
              <div className="dashboard-meta"><ScanLine size={15} /><span>{simulated ? 'BACKEND MOCK FRAMES' : 'NASA IRSA / SPHEREx'}<br /><strong>J2000 / ICRS</strong></span></div>
            </motion.div>

            <div className="workspace-grid">
              <motion.div className="left-column" id="target-catalog" initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.5 }}>
                <TargetSelector targets={targets} target={target} onSelect={selectTarget} loading={loading} />
                <section className="target-readout">
                  <div className="readout-title"><Compass size={14} /><span>POINTING SOLUTION</span></div>
                  <div className="readout-row"><span>RIGHT ASCENSION</span><strong>{target.ra}</strong></div>
                  <div className="readout-row"><span>DECLINATION</span><strong>{target.dec}</strong></div>
                  <div className="readout-row"><span>REGION</span><strong>{target.constellation || 'Field of view'}</strong></div>
                  {target.magnitude != null && <div className="readout-row"><span>APPARENT MAG.</span><strong>{target.magnitude.toFixed(1)} <small>AB</small></strong></div>}
                </section>
                <div className="data-source"><span className="data-source-mark"><Aperture size={14} /></span><span>DATA MODE<br /><strong>{simulated ? 'SIMULATED SKY PATCH' : 'REAL SPHEREx CUTOUTS'}</strong></span></div>
                {error && <p className="catalog-notice" role="status">{error}</p>}
              </motion.div>

              <motion.div className="center-column" initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.55, delay: 0.06 }}>
                <BlinkPlayer target={target} onFrames={handleFrames} />
                <div className="viewer-footnote"><Sparkles size={13} /><span>{simulated ? 'Procedural visualization for interaction preview' : 'Real SPHEREx Level-2 cutouts from NASA/IPAC IRSA'}</span><span className="footnote-divider" /><Orbit size={13} /><span>{frameInfo ? `${frameInfo.count} FRAMES` : 'NO FRAMES YET'}</span></div>
              </motion.div>

              <motion.div className="right-column" id="telemetry" initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.1 }} transition={{ duration: 0.55, delay: 0.12 }}>
                <TelemetrySidebar target={target} />
              </motion.div>
            </div>
          </div>
        </section>
      </main>

      <footer className="editorial-footer" id="mission-data">
        <div className="footer-topline">
          <a className="footer-brand" href="#home">SKYTIME<span>.</span></a>
          <p>Reading the sky in more dimensions.</p>
          <a className="back-to-top" href="#home">BACK TO TOP <ArrowUpRight size={13} /></a>
        </div>
        <div className="footer-rule" />
        <div className="footer-bottom">
          <span>BUILT FOR NASA SPACE APPS CHALLENGE</span>
          <span>SPHEREx ALL-SKY INFRARED SURVEY</span>
          <div><a href="#explorer">Explorer</a><a href="#telemetry">Telemetry</a><a href="#target-catalog">Target catalog</a></div>
          <span className="footer-credit">{simulated ? 'SIMULATED DATA / SCIENCE PREVIEW' : 'DATA: NASA/IPAC IRSA, SPHEREx'}</span>
        </div>
      </footer>
    </div>
  )
}
