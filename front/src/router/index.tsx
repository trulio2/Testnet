import { createHashRouter, Navigate } from 'react-router-dom'
import { LazyPage, RootLayout } from './Layout'

import { ErrorPage, Home, Changelog, Wallet } from '@/views/pages'

export const router = createHashRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: ':symbol?',
        element: (
          <LazyPage>
            <Home />
          </LazyPage>
        )
      },
      {
        path: 'wallet',
        element: (
          <LazyPage>
            <Wallet />
          </LazyPage>
        )
      },
      {
        path: 'changelog',
        element: (
          <LazyPage>
            <Changelog />
          </LazyPage>
        )
      },
      {
        path: '*',
        element: <Navigate to="/" replace />
      }
    ]
  }
])
