import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { cam } from './canvas/camera'
import { useUI, useData } from './store'

import { model } from './calendar/model'
import { useItems } from './canvasItems'

if (import.meta.env.DEV) Object.assign(window, { __cam: cam, __ui: useUI, __data: useData, __model: model, __items: useItems })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
