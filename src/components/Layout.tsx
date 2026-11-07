import { NavLink, Outlet } from 'react-router-dom'
import { useDb } from '../hooks/useDb.ts'

const links = [
  { to: '/', label: 'Início', end: true },
  { to: '/bancos', label: 'Bancos', end: false },
  { to: '/classificacoes', label: 'Classificações', end: false },
  { to: '/transacoes', label: 'Transações', end: false },
]

function linkClass(isActive: boolean) {
  return isActive
    ? 'rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white'
    : 'rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100'
}

export default function Layout() {
  const db = useDb()

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold tracking-tight">FinBack</p>
            <p className="text-xs text-zinc-500">Neste navegador</p>
          </div>
          <nav className="flex flex-wrap gap-1">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => linkClass(isActive)}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        {db.status === 'loading' && <p className="text-sm text-zinc-600">Abrindo o banco local…</p>}
        {db.status === 'error' && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {db.errorMessage}
          </p>
        )}
        {db.status === 'ready' && <Outlet />}
      </main>
    </div>
  )
}
