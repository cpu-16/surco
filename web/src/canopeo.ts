/**
 * Cobertura verde por el método Canopeo (Patrignani y Ochsner 2015, doi:10.2134/agronj15.0150):
 * un píxel es verde si R/G < P1, B/G < P2 y 2G − R − B > P3. Valores por defecto P1 = P2 = 0.95, P3 = 20.
 * Se calcula en el teléfono: la foto no sale del aparato para medirla.
 */
export type Resultado = { cobertura: number; mascara: string; miniatura: string; jpeg: Blob }

export async function medir(archivo: Blob, p1 = 0.95, p2 = 0.95, p3 = 20): Promise<Resultado> {
  const img = await createImageBitmap(archivo)
  const lado = 480 // ponytail: 480 px basta para un porcentaje; subir si se quiere mapa fino
  const k = Math.min(1, lado / Math.max(img.width, img.height))
  const w = Math.round(img.width * k), h = Math.round(img.height * k)
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  const jpeg = await c.convertToBlob({ type: 'image/jpeg', quality: 0.82 })
  const miniatura = await blobAUrl(jpeg)
  const datos = ctx.getImageData(0, 0, w, h)
  const d = datos.data
  let verdes = 0
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const verde = g > 0 && r / g < p1 && b / g < p2 && 2 * g - r - b > p3
    if (verde) verdes++
    // máscara visible: verde puro donde hay planta, el resto en gris
    const gris = (r + g + b) / 3
    d[i] = verde ? 40 : gris * 0.55; d[i + 1] = verde ? 200 : gris * 0.55; d[i + 2] = verde ? 60 : gris * 0.55
  }
  ctx.putImageData(datos, 0, 0)
  const mascara = await blobAUrl(await c.convertToBlob({ type: 'image/jpeg', quality: 0.7 }))
  return { cobertura: Math.round((100 * verdes) / (w * h)), mascara, miniatura, jpeg }
}

const blobAUrl = (b: Blob) =>
  new Promise<string>((ok) => {
    const r = new FileReader()
    r.onload = () => ok(r.result as string)
    r.readAsDataURL(b)
  })
