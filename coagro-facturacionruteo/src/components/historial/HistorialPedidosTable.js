import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import DataTable from '../ui/DataTable';
import { Etiqueta } from './HistorialComun';
import { formatFechaDoc, formatMonto } from '../../utils/formato';
import { colors, spacing } from '../../theme';

// Estado del pedido (EST_PED): 'F' facturado; cualquier otro, pendiente.
export function EtiquetaEstadoPedido({ estado, style }) {
  return estado === 'F' ? (
    <Etiqueta texto="Facturado" tono="verde" style={style} />
  ) : (
    <Etiqueta texto="Pendiente" tono="ambar" style={style} />
  );
}

const COLUMNS = [
  {
    key: 'numero',
    title: 'Pedido',
    width: 110,
    grow: true,
    render: (p) => (
      <View>
        <Text style={styles.texto} numberOfLines={1}>{p.numero}</Text>
        {p.facturas.length ? (
          <View style={styles.facturas}>
            <Feather name="file-text" size={11} color={colors.textMuted} />
            <Text style={styles.facturasText}>
              {p.facturas.length} {p.facturas.length === 1 ? 'factura' : 'facturas'}
            </Text>
          </View>
        ) : null}
      </View>
    ),
  },
  {
    key: 'fecha',
    title: 'Fecha',
    width: 72,
    render: (p) => <Text style={styles.texto}>{formatFechaDoc(p.fecha)}</Text>,
  },
  {
    key: 'total',
    title: 'Total',
    width: 96,
    align: 'right',
    render: (p) => <Text style={[styles.texto, styles.derecha]}>{formatMonto(p.total)}</Text>,
  },
  {
    key: 'estado',
    title: 'Estado',
    width: 84,
    render: (p) => <EtiquetaEstadoPedido estado={p.estado} />,
  },
];

export const clavePedido = (p) => `${p.compania}|${p.numero}`;

// Tabla del historial de pedidos de un cliente (seleccionable).
// pedidos: [{ compania, numero, fecha, total (MON_PED), estado (EST_PED), facturas }]
export default function HistorialPedidosTable({ pedidos, selectedKey, onSelect, emptyText, style }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={pedidos}
      keyExtractor={clavePedido}
      onRowPress={onSelect}
      selectedKey={selectedKey}
      highlightKey="numero"
      emptyText={emptyText}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  texto: { fontSize: 13, color: colors.text },
  derecha: { textAlign: 'right' },
  facturas: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  facturasText: { fontSize: 11, color: colors.textMuted },
});
