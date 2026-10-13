import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import DataTable from '../../components/ui/DataTable';
import { getDocumentosCobro } from '../../repositories/cobros';
import { formatFechaDoc, formatMonto } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const claveDoc = (d) => `${d.codTipo}|${d.documento}`;

const COLUMNS = [
  { key: 'tipo', title: 'Tipo', width: 90 },
  { key: 'documento', title: 'Documento', width: 110 },
  { key: 'moneda', title: 'Moneda', width: 70 },
  { key: 'montoAPagarLoc', title: 'Monto a pagar Loc', width: 120, align: 'right', render: (item) => <Monto value={item.montoAPagarLoc} /> },
  { key: 'montoAPagarDolar', title: 'Monto a pagar Dólar', width: 130, align: 'right', render: (item) => <Monto value={item.montoAPagarDolar} /> },
  { key: 'saldoDocLocal', title: 'Saldo doc Local', width: 120, align: 'right', render: (item) => <Monto value={item.saldoDocLocal} /> },
  { key: 'saldoDocDolar', title: 'Saldo doc Dólar', width: 120, align: 'right', render: (item) => <Monto value={item.saldoDocDolar} /> },
  { key: 'tipoCambio', title: 'Tipo cambio', width: 90, align: 'right', render: (item) => <Monto value={item.tipoCambio} /> },
  { key: 'fecha', title: 'Hecho', width: 80, render: (item) => <Celda text={formatFechaDoc(item.fecha)} /> },
  { key: 'vence', title: 'Vence', width: 80, render: (item) => <Celda text={formatFechaDoc(item.vence)} /> },
];

// Documentos pendientes del cliente (alCXC_PEN_COB, descargados con Datos > Cargar datos) para el
// cobro elegido (moneda + tipo de pago). Los montos del resumen se muestran en la moneda del cobro
// ('Local' | 'Dólar').
export default function CobroDocumentosView({ cliente, ruta, moneda, tipoPago, onBack }) {
  const insets = useSafeAreaInsets();
  const [documentos, setDocumentos] = useState([]);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);

  useEffect(() => {
    let cancelado = false;
    getDocumentosCobro({ cliente: cliente.codigo, ruta })
      .then((lista) => {
        if (!cancelado) setDocumentos(lista);
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudieron leer los documentos.');
      });
    return () => {
      cancelado = true;
    };
  }, [cliente.codigo, ruta]);

  const enDolar = moneda === 'Dólar';
  const doc = documentos.find((d) => claveDoc(d) === seleccionado) ?? null;
  const totalAPagar = useMemo(
    () => documentos.reduce((sum, d) => sum + Number((enDolar ? d.montoAPagarDolar : d.montoAPagarLoc) ?? 0), 0),
    [documentos, enDolar],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Documentos a cobrar" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
          <Text style={styles.clientMeta} numberOfLines={1}>
            {tipoPago} · Moneda {moneda}
          </Text>
        </View>

        <DataTable
          columns={COLUMNS}
          data={documentos}
          keyExtractor={claveDoc}
          onRowPress={(item) => setSeleccionado(claveDoc(item))}
          selectedKey={seleccionado}
          emptyText="El cliente no tiene documentos pendientes"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.card}>
          <View style={styles.row}>
            <Field label="Fecha vencimiento" value={doc ? formatFechaDoc(doc.vence) : ''} />
            <Field label="Monto documento" value={doc ? formatMonto(enDolar ? doc.montoDocDolar : doc.montoDocLocal) : ''} />
          </View>
          <View style={styles.row}>
            <Field label="Saldo documento" value={doc ? formatMonto(enDolar ? doc.saldoDocDolar : doc.saldoDocLocal) : ''} />
            <Field label="Monto pagar" value={doc ? formatMonto(enDolar ? doc.montoAPagarDolar : doc.montoAPagarLoc) : ''} />
          </View>
          <Field label="Total a pagar" value={formatMonto(totalAPagar)} total />
        </View>
      </ScrollView>
    </View>
  );
}

function Celda({ text, align }) {
  return <Text style={[styles.cellText, align && { textAlign: align }]} numberOfLines={1}>{text}</Text>;
}

function Monto({ value }) {
  return <Celda text={formatMonto(value)} align="right" />;
}

function Field({ label, value, total }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.readonly, total && styles.readonlyTotal]}>
        <Text style={[styles.value, total && styles.valueTotal]} numberOfLines={1}>{value || '—'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F5FA' },
  content: { padding: spacing.md, gap: spacing.md },
  infoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  clientMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  error: { fontSize: 12, color: '#991B1B' },
  cellText: { fontSize: 14, lineHeight: 19, color: colors.textPrimary },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  field: { flex: 1 },
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
  readonly: {
    minHeight: 42,
    borderRadius: radius.sm + 2,
    backgroundColor: '#F3F5F9',
    paddingHorizontal: spacing.sm + 2,
    justifyContent: 'center',
  },
  readonlyTotal: { backgroundColor: '#DCF5E3' },
  value: { fontSize: 14, color: colors.textPrimary },
  valueTotal: { fontSize: 16, fontWeight: '700', color: '#15803D' },
});
