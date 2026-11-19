// División territorial (opción B, migración v34), común a la ficha del cliente y al pedido:
//   Departamento (DIVISION_GEOGRAFICA1) -> Municipio de la reforma (FR_MUNICIPIO; en CLIENTE_CIA va en
//   DIVISION_GEOGRAFICA3) -> Distrito (DIVISION_GEOGRAFICA2 del ERP; FR_DISTRITO dice su municipio).
// Los códigos de municipio son únicos SOLO dentro del departamento ('14' existe en varios).
//
// Las listas son las de los catálogos locales:
//   departamentos [{ pais, codigo, descripcion }]
//   municipios    [{ pais, division1, codigo, descripcion }]
//   distritos     [{ pais, division1, codigo, descripcion, municipio (null si FR_DISTRITO no lo tiene) }]

// En este ERP CLIENTE_CIA.COD_PAIS no siempre es un país (trae códigos de vendedor como 'VRR1');
// las divisiones solo existen para 'SAL'.
export const PAIS_DIVISION_DEFECTO = 'SAL';

// País de las divisiones: codPais si hay departamentos de ese país; si no, 'SAL'. (En SQL:
// COALESCE((SELECT PAIS FROM DIVISION_GEOGRAFICA1 WHERE PAIS = cc.COD_PAIS LIMIT 1), 'SAL').)
export function paisGeografico(codPais, departamentos) {
  return codPais && (departamentos ?? []).some((d) => d.pais === codPais) ? codPais : PAIS_DIVISION_DEFECTO;
}

export const departamentosDe = (departamentos, pais) => (departamentos ?? []).filter((d) => d.pais === pais);

export const municipiosDe = (municipios, pais, departamento) =>
  departamento ? (municipios ?? []).filter((m) => m.pais === pais && m.division1 === departamento) : [];

// Distritos del departamento; con municipio elegido, solo los de ese municipio. Sin municipio se
// muestran todos los del departamento (al elegir uno, el municipio se llena solo).
export const distritosDe = (distritos, pais, departamento, municipio) =>
  departamento
    ? (distritos ?? []).filter(
        (d) => d.pais === pais && d.division1 === departamento && (!municipio || d.municipio === municipio)
      )
    : [];

// Municipio al que pertenece un distrito según FR_DISTRITO; null si no se sabe.
export const municipioDeDistrito = (distritos, pais, departamento, distrito) =>
  (distrito &&
    (distritos ?? []).find((d) => d.pais === pais && d.division1 === departamento && d.codigo === distrito)?.municipio) ||
  null;
