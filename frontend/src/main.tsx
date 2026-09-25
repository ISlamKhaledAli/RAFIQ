import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/cairo/400.css'
import '@fontsource/cairo/500.css'
import '@fontsource/cairo/600.css'
import '@fontsource/cairo/700.css'
import '@fontsource/cairo/800.css'
import './index.css'
import App from './App.tsx'
import { FeaturesProvider } from './context/FeaturesProvider'
import { ErrorBoundary } from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <FeaturesProvider>
        <App />
      </FeaturesProvider>
    </ErrorBoundary>
  </StrictMode>,
)
