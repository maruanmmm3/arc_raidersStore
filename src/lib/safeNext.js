// Evita redirecciones abiertas tras el login: solo rutas internas
export function safeNext(next) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}
