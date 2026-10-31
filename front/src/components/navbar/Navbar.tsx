import { Link, useLocation } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/changelog', label: 'Changelog' }
]

export default function Navbar() {
  const { pathname } = useLocation()

  const isLinkActive = (to: string) =>
    to === '/' ? !pathname.startsWith('/changelog') : pathname.startsWith(to)

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
      </ul>
    </nav>
  )
}
