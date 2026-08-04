import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// No StrictMode: its double-invoked effects would fire two UCI searches per
// position at the same engine worker, which the UCI protocol has no way to
// distinguish from a real second search.
createRoot(document.getElementById('root')!).render(<App />)
