import { cam } from './camera'
import { model } from '../calendar/model'

/** Posiciona la cámara en la vista general sin animar (primer frame). */
export function fitCamOverview() {
  const m = model.current
  if (!m) return
  cam.setBounds(m.layout.bounds)
  const target = cam.fitCam(m.layout.bounds, 40, 0.3)
  cam.jump(target)
}
