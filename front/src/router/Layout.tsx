import { Suspense, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { LiquidationNotices, Navbar, SessionNotice } from '@/components'
import { useDocumentTitle, useSessionStatus } from '@/modules/services'
import { init } from '@/setup'

function RootLayout() {
  const status = useSessionStatus()

  useDocumentTitle(status === 'active')

  useEffect(() => {
    void init()
  }, [])

  if (status === 'blocked') return <SessionNotice />
  if (status === 'pending') return null

  return (
    <>
      <Navbar />
      <LiquidationNotices />
      <main>
        <Outlet />
      </main>
    </>
  )
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="spinner" role="status" aria-label="Loading"></div>
      }
    >
      {children}
    </Suspense>
  )
}

export { LazyPage, RootLayout }
