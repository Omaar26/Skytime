import { useEffect, useState } from 'react'
import { Check, Copy, Languages, Moon, Radio, Sun } from 'lucide-react'

const sections = [
  { label: 'Home', href: '#home' },
  { label: 'Explorer', href: '#explorer' },
  { label: 'Telemetry', href: '#telemetry' },
  { label: 'Mission Data', href: '#mission-data' },
]

export default function Navbar({ target, theme, onThemeToggle }) {
  const [copied, setCopied] = useState(false)
  const [language, setLanguage] = useState('EN')
  const [activeSection, setActiveSection] = useState('Home')

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visibleSection = entries.find((entry) => entry.isIntersecting)
      if (!visibleSection) return
      const section = sections.find((item) => item.href === `#${visibleSection.target.id}`)
      if (section) setActiveSection(section.label)
    }, { rootMargin: '-22% 0px -68% 0px' })

    sections.forEach((section) => {
      const element = document.querySelector(section.href)
      if (element) observer.observe(element)
    })
    return () => observer.disconnect()
  }, [])

  const shareObservation = async () => {
    const url = new URL(window.location.href)
    url.searchParams.set('ra', target.ra)
    url.searchParams.set('dec', target.dec)
    url.searchParams.set('fov', target.fov || 0.1)
    if (target.id !== 'custom') url.searchParams.set('target', target.id)
    else url.searchParams.delete('target')
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (error) {
      console.error('Unable to copy observation URL', error)
      window.prompt('Copy this observation URL', url.toString())
    }
  }

  const selectSection = (section) => setActiveSection(section)
  const toggleLanguage = () => {
    const nextLanguage = language === 'EN' ? 'FR' : 'EN'
    setLanguage(nextLanguage)
    document.documentElement.lang = nextLanguage.toLowerCase()
  }

  return (
    <header className="topbar editorial-nav">
      <a className="brand editorial-brand" href="#home" onClick={() => selectSection('Home')} aria-label="Skytime home">
        <strong>SKYTIME<span>.</span></strong>
        <i className="brand-beacon" />
      </a>
      <nav className="primary-nav" aria-label="Main navigation">
        {sections.map((section) => (
          <a
            href={section.href}
            className={activeSection === section.label ? 'active' : ''}
            key={section.label}
            onClick={() => selectSection(section.label)}
          >
            {section.label}
          </a>
        ))}
      </nav>
      <div className="nav-actions">
        <span className="survey-status"><i /> SURVEY: ACTIVE</span>
        <button className="nav-icon-button share-icon" onClick={shareObservation} aria-label={copied ? 'Observation link copied' : 'Share observation'}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
        <button className="nav-locale" onClick={toggleLanguage} aria-label={`Change language, current language ${language}`}>
          <Languages size={14} /><span>{language}</span>
        </button>
        <button className="nav-icon-button theme-toggle" onClick={onThemeToggle} aria-label={`Switch to ${theme === 'dark' ? 'alternate' : 'dark'} theme`}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  )
}
