import './utils/numberEnforcer.ts'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/600.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import '@fontsource/cairo/400.css'
import '@fontsource/cairo/500.css'
import '@fontsource/cairo/600.css'
import '@fontsource/cairo/700.css'
import '@fontsource/cairo/800.css'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './context/ThemeProvider'
import { FeaturesProvider } from './context/FeaturesProvider'
import { AuthProvider } from './context/AuthContext'
import { UnsavedChangesProvider } from './context/UnsavedChangesProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { watchTextScaleViewport } from './utils/textScale'
import { startMotion } from './utils/motion'
import { invoke } from './bridge/ipc'

// Apply the saved text size before the first render so there is no size flash; it is re-clamped when the window is resized.
watchTextScaleViewport(window, document.documentElement, localStorage)
// Animations stay off unless root turned them on: cached value first, then the host's answer (readable before login).
void startMotion(() => invoke('settings:getStoreProfile'), document.documentElement, localStorage)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <FeaturesProvider>
          <AuthProvider>
            <UnsavedChangesProvider>
              <App />
            </UnsavedChangesProvider>
          </AuthProvider>
        </FeaturesProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
