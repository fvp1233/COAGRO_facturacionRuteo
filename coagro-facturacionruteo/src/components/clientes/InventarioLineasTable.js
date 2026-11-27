import { useMemo } from 'react';

import DataTable from '../ui/DataTable';
import { formatCantidad } from '../../utils/formato';

// Líneas de un inventario del cliente (getLineasInventario): artículo, cajas y unidades contadas.
const COLUMNS = [
  { key: 'codigo', title: 'Código', width: 80 },
  { key: 'descripcion', title: 'Descripción', width: 180, grow: true },
  { key: 'cajasTexto', title: 'Cajas', width: 90, align: 'right' },
  { key: 'unidadesTexto', title: 'Unidades', width: 100, align: 'right' },
];

const conEmpaque = (n, empaque) => `${formatCantidad(n)}${empaque ? ` ${empaque}` : ''}`;

export default function InventarioLineasTable({ lineas }) {
  const filas = useMemo(
    () =>
      lineas.map((l) => ({
        ...l,
        descripcion: l.descripcion || '—',
        cajasTexto: conEmpaque(l.cajas, l.empAlm),
        unidadesTexto: conEmpaque(l.unidades, l.empDet),
      })),
    [lineas]
  );
  return (
    <DataTable
      columns={COLUMNS}
      data={filas}
      keyExtractor={(l) => l.codigo}
      emptyText="El inventario no tiene artículos"
    />
  );
}
