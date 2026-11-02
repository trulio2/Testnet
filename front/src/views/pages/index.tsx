import { lazy } from 'react'

const ErrorPage = lazy(() => import('./error/ErrorPage'))
const Home = lazy(() => import('./home/Home'))
const Changelog = lazy(() => import('./changelog/Changelog'))
const Wallet = lazy(() => import('./wallet/Wallet'))

export { ErrorPage, Home, Changelog, Wallet }
