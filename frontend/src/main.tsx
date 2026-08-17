import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// No StrictMode: its double-invoked effects would ask the native Maia pool for
// every position twice and make the analysis panel flicker.
createRoot(document.getElementById('root')!).render(<App />)
