import { Link, useLocation } from 'react-router-dom'
import { useLocale } from '@/modules/services'
import type { Locale } from '@/types'

export default function Navbar() {
  const { pathname } = useLocation()
  const { locale, setLocale, t } = useLocale()

  const isLinkActive = (to: string) =>
    to === '/' ? !pathname.startsWith('/changelog') : pathname.startsWith(to)

  const links = [
    { to: '/', label: t('nav.home') },
    { to: '/changelog', label: t('nav.changelog') }
  ]

  return (
    <nav className="navbar" aria-label="Primary">
      <Link to="/" className="navbar-brand">
        Testnet
      </Link>
      <ul className="navbar-links">
        {links.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              className={`navbar-link${isLinkActive(link.to) ? ' active' : ''}`}
            >
              {link.label}
            </Link>
          </li>
        ))}
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="w-full px-2 py-1.5 text-sm border border-[var(--border)] rounded-md bg-[var(--bg)] text-[var(--text)] cursor-pointer focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="en">English</option>
          <option value="pt">Português</option>
        </select>
      </ul>
    </nav>
  )
}
