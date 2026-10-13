/** Identificador (slug) de un integrante del grupo. Cualquier cantidad de personas. */
export type Person = string
/** De quién es un plan: un integrante, "ambos" (= todo el grupo) o "externo". */
export type Owner = string
export const ALL = 'ambos'
export const EXTERNAL = 'externo'

export interface Profile {
  id: string
  person: Person
  display_name: string
  color: string
  /** foto de perfil como data URL (jpeg ~160px) */
  avatar?: string | null
  /** quien creó el grupo: puede ver y regenerar el código de invitación */
  is_admin?: boolean
}

export interface EventRow {
  id: string
  owner: Owner
  title: string
  description_md: string | null
  start_date: string | null
  end_date: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  rrule: string | null
  rrule_until: string | null
  done: boolean
  is_meetup: boolean
  emoji: string | null
  /** portada opcional (data URL jpeg) */
  cover?: string | null
  /** punto de la imagen que se muestra centrado, "x y" en % */
  cover_pos?: string | null
  /** adjuntos del plan (se arrastran desde el canvas encima del plan) */
  attachments?: Attachment[]
  sort_order: number
  /** posición libre en el canvas (solo si start_date es null); null = en la bandeja */
  canvas_x: number | null
  canvas_y: number | null
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface OverrideFields {
  title?: string
  description_md?: string | null
  start_date?: string
  start_time?: string | null
  end_time?: string | null
  all_day?: boolean
  owner?: Owner
  done?: boolean
  emoji?: string | null
}

export interface ExceptionRow {
  id: string
  event_id: string
  occurrence_date: string
  kind: 'skip' | 'override'
  override: OverrideFields | null
  updated_by: string
  updated_at: string
}

/** Cada aparición concreta de un plan en un día. Calculada, no se guarda. */
export interface Occurrence {
  key: string
  event: EventRow
  /** día donde se dibuja */
  date: string
  /** fecha original de la ocurrencia (clave de excepciones) */
  origDate: string
  owner: Owner
  title: string
  description_md: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  done: boolean
  emoji: string | null
  cover?: string | null
  cover_pos?: string | null
  is_meetup: boolean
  recurring: boolean
  dayIndex: number
  dayCount: number
  sort: number
}

/** Elemento referenciable por una flecha. */
export interface ElRef {
  k: 'month' | 'day' | 'card'
  id: string
}

/** Etiqueta/color/comentario aplicado a un conjunto de días (ej. "Viaje a Buenos Aires"). */
export interface MarkData {
  days: string[]
  label: string
  color: string
  note?: string
  /** de quién es la etiqueta (si falta: de ambos) */
  owner?: Owner
}

/** Adjunto de un plan: lo mismo que un objeto del canvas, sin posición. */
export interface Attachment {
  id: string
  type: 'image' | 'text' | 'link' | 'youtube' | 'pdf'
  text?: string
  url?: string
  title?: string
  videoId?: string
  path?: string
  name?: string
  size?: number
  ar?: number
}

/** Objeto pegado en el canvas: imagen, texto, link, video de YouTube o PDF. */
export interface ObjData {
  type: 'image' | 'text' | 'link' | 'youtube' | 'pdf'
  x: number
  y: number
  w: number
  h: number
  text?: string
  url?: string
  title?: string
  videoId?: string
  /** youtube: video incrustado · pdf: vista previa abierta */
  embed?: boolean
  /** ruta del archivo en el almacenamiento (imagen / pdf) */
  path?: string
  name?: string
  size?: number
  /** relación ancho/alto (imágenes y video) */
  ar?: number
}

/** Posiciones, flechas y marcas del canvas (tabla canvas_items). */
export type CanvasData =
  | { x: number; y: number; ungrouped?: boolean } // month:YYYY-MM
  | { x: number; y: number; w?: number; h?: number } // day:YYYY-MM-DD (posición relativa al mes + tamaño propio opcional)
  | { from: ElRef; to: ElRef; label?: string; via?: { x: number; y: number } } // arrow (via: punto por donde pasa la curva moldeada a mano)
  | MarkData // mark:uuid
  | ObjData // obj:uuid

export interface CanvasItem {
  id: string
  kind: 'month' | 'day' | 'arrow' | 'mark' | 'obj'
  data: CanvasData
  updated_by: string
  updated_at: string
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Anchor =
  | { d: string; rx: number; ry: number }
  | { m: string; rx: number; ry: number }
  | { wx: number; wy: number }
