import { Link, useLocation } from 'react-router-dom'
import { useActiveSymbol, useLocale } from '@/modules/services'
import type { Locale } from '@/types'
import TickerBar from '../tickerBar/TickerBar'

export default function Navbar() {
  const { pathname } = useLocation()
  const { locale, setLocale, t } = useLocale()
  const symbol = useActiveSymbol()

  const isLinkActive = (to: string) =>
    to === '/' ? !pathname.startsWith('/changelog') : pathname.startsWith(to)

  const links = [
    { to: '/', label: t('nav.home') },
    { to: '/changelog', label: t('nav.changelog') }
  ]

  return (
    <header className="navbar">
      <Link to="/" className="navbar-brand">
        Testnet
      </Link>
      {symbol && <TickerBar symbol={symbol} />}
      <nav aria-label="Primary">
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
    </header>
  )
}
