/** Throttle con trailing call. */
export function throttle<A extends unknown[]>(fn: (...a: A) => void, msArg: number | (() => number)) {
  const wait = () => (typeof msArg === 'function' ? msArg() : msArg)
  let last = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: A | null = null
  return (...a: A) => {
    const now = performance.now()
    if (now - last >= wait()) {
      last = now
      fn(...a)
    } else {
      pending = a
      if (!timer) {
        timer = setTimeout(() => {
          timer = undefined
          last = performance.now()
          if (pending) fn(...pending)
          pending = null
        }, Math.max(0, wait() - (now - last)))
      }
    }
  }
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const initial = (name: string) => name.trim().charAt(0).toUpperCase()
