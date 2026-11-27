// División territorial (catálogos nativos de Softland, migración v38), común a la ficha del cliente
// y al pedido. Listas encadenadas:
//   Departamento (DIVISION_GEOGRAFICA1) -> Municipio (DIVISION_GEOGRAFICA2) -> Distrito (DIVISION_GEOGRAFICA3).
// Ejemplo: 01 Ahuachapán -> 0113 Ahuachapán Norte -> 0103 Atiquizaya.
// Los códigos de municipio son únicos dentro del departamento y los de distrito dentro del
// departamento + municipio: siempre se filtra por toda la cadena.
//
// Las listas son las de los catálogos locales:
//   departamentos [{ pais, codigo, descripcion }]
//   municipios    [{ pais, division1, codigo, descripcion }]
//   distritos     [{ pais, division1, division2, codigo, descripcion }]

// En este ERP CLIENTE_CIA.COD_PAIS no siempre es un país (trae códigos de vendedor como 'VRR1');
// las divisiones solo existen para 'ESA'.
export const PAIS_DIVISION_DEFECTO = 'ESA';

// País de las divisiones: codPais si hay departamentos de ese país; si no, 'ESA'. (En SQL:
// COALESCE((SELECT PAIS FROM DIVISION_GEOGRAFICA1 WHERE PAIS = cc.COD_PAIS LIMIT 1), 'ESA').)
export function paisGeografico(codPais, departamentos) {
  return codPais && (departamentos ?? []).some((d) => d.pais === codPais) ? codPais : PAIS_DIVISION_DEFECTO;
}

export const departamentosDe = (departamentos, pais) => (departamentos ?? []).filter((d) => d.pais === pais);

export const municipiosDe = (municipios, pais, departamento) =>
  departamento ? (municipios ?? []).filter((m) => m.pais === pais && m.division1 === departamento) : [];

// Distritos del municipio elegido (sin municipio no hay distritos).
export const distritosDe = (distritos, pais, departamento, municipio) =>
  departamento && municipio
    ? (distritos ?? []).filter((d) => d.pais === pais && d.division1 === departamento && d.division2 === municipio)
    : [];
