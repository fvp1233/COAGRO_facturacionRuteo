// Minúsculas y sin acentos, para que "jose" encuentre "José".
export const normalizar = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
