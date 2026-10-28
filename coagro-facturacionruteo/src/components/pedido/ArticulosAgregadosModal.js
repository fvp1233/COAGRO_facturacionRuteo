import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CenteredHeader from '../ui/CenteredHeader';
import DataTable from '../ui/DataTable';
import { colors, spacing } from '../../theme';

// Pestaña con los artículos agregados al pedido (con + en Artículos del pedido).
// lineas: [{ codigo, descripcion, cantidadTexto (ej. "1 BARRIL + 100 LT"), total, moneda }].
// formatMonto(n, moneda) da el texto del monto.
// onEliminar(codigo) quita la línea; total = suma de las líneas.
export default function ArticulosAgregadosModal({ visible, lineas, total, formatMonto, onEliminar, onClose }) {
  const insets = useSafeAreaInsets();
  const moneda = lineas[0]?.moneda;

  const columns = [
    { key: 'codigo', title: 'CÓDIGO', width: 76, numberOfLines: 1 },
    { key: 'descripcion', title: 'DESCRIPCIÓN', width: 160, grow: true },
    {
      key: 'cantidad',
      title: 'CANTIDAD',
      width: 110,
      align: 'right',
      render: (l) => <Text style={styles.num}>{l.cantidadTexto}</Text>,
    },
    {
      key: 'total',
      title: 'TOTAL',
      width: 92,
      align: 'right',
      render: (l) => <Text style={styles.num}>{formatMonto(l.total, l.moneda)}</Text>,
    },
    {
      key: 'eliminar',
      title: '',
      width: 32,
      render: (l) => (
        <Pressable onPress={() => onEliminar(l.codigo)} hitSlop={10} style={styles.delete}>
          <Feather name="trash-2" size={18} color={colors.error} />
        </Pressable>
      ),
    },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <CenteredHeader title="Artículos agregados" onBack={onClose} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <DataTable
            columns={columns}
            data={lineas}
            keyExtractor={(l) => l.codigo}
            emptyText="Aún no has agregado artículos. Usa el botón + para agregarlos."
          />
        </ScrollView>
        <View style={styles.bar}>
          <Text style={styles.barLabel}>
            Total del pedido · {lineas.length} {lineas.length === 1 ? 'artículo' : 'artículos'}
          </Text>
          <Text style={styles.barTotal}>{formatMonto(total, moneda)}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  scroll: { flex: 1 },
  content: { padding: spacing.md },
  num: { textAlign: 'right', fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
  delete: { alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barLabel: { fontSize: 13, color: colors.textMuted },
  barTotal: { fontSize: 18, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
