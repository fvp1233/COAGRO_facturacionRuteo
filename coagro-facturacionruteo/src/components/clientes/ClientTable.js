import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import DataTable from '../ui/DataTable';
import { colors, radius, spacing } from '../../theme';

const SELECTED = colors.primary;

const COLUMNS = [
  {
    key: 'nombre',
    title: 'CLIENTE',
    width: 180,
    grow: true,
    render: (cliente, { selected }) => (
      <View style={styles.nameCell}>
        {selected ? <Feather name="check-circle" size={16} color={SELECTED} style={styles.check} /> : null}
        <View style={styles.rowTexts}>
          <Text style={[styles.name, selected && styles.nameSelected]} numberOfLines={1}>
            {cliente.nombre}
          </Text>
          {cliente.rnc ? <Text style={styles.rnc}>{`RNC ${cliente.rnc}`}</Text> : null}
        </View>
      </View>
    ),
  },
  {
    key: 'codigo',
    title: 'CÓDIGO',
    width: 96,
    align: 'right',
    render: (cliente, { selected }) => (
      <View style={[styles.code, selected && styles.codeSelected]}>
        <Text style={[styles.codeText, selected && styles.codeTextSelected]} numberOfLines={1}>
          {cliente.codigo}
        </Text>
      </View>
    ),
  },
];

export default function ClientTable({ clientes, selectedCodigo, onSelect }) {
  return (
    <DataTable
      columns={COLUMNS}
      data={clientes}
      keyExtractor={(c) => c.codigo}
      selectedKey={selectedCodigo}
      onRowPress={onSelect}
      emptyText="No se encontraron clientes"
    />
  );
}

const styles = StyleSheet.create({
  nameCell: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  check: {
    marginRight: spacing.sm,
  },
  rowTexts: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  nameSelected: {
    fontWeight: '700',
    color: SELECTED,
  },
  rnc: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  code: {
    alignSelf: 'flex-end',
    backgroundColor: colors.border,
    borderRadius: radius.sm - 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  codeSelected: {
    backgroundColor: SELECTED,
  },
  codeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  codeTextSelected: {
    color: colors.onPrimary,
  },
});
