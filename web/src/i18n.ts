/** Idioma de la app: español o inglés. Cambiarlo recarga la página, así todo el texto
 *  (también el que se arma al cargar, como la lista de pasos) sale en el idioma nuevo. */
const LLAVE = 'surco-idioma'
const guardado = (() => { try { return localStorage.getItem(LLAVE) } catch { return null } })()
export const idioma: 'es' | 'en' = guardado === 'en' || guardado === 'es' ? guardado
  : (navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es'
document.documentElement.lang = idioma

/** El mismo texto en los dos idiomas, uno al lado del otro: L('Paso', 'Step'). Sirve igual para JSX. */
export const L = <T,>(es: T, en: T): T => (idioma === 'en' ? en : es)

export const cambiarIdioma = (nuevo: 'es' | 'en') => {
  try { localStorage.setItem(LLAVE, nuevo) } catch { /* sin almacenamiento: dura hasta recargar */ }
  location.reload()
}
