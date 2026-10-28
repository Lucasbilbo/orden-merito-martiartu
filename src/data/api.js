// Punto único de acceso a datos: Supabase o modo demo según ?demo=1.
import { DEMO } from '../config.js'
import * as real from './real.js'
import * as demo from './demo.js'

const api = DEMO ? demo : real
export default api
export { DEMO }
export const resetDemo = demo.resetDemo
