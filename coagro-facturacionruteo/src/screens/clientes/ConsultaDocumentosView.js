import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import DataTable from '../../components/ui/DataTable';
import { getDocumentosCobro } from '../../repositories/cobros';
import { descargarDocumentoPdf } from '../../services/documentoPdf';
import { isNetworkError } from '../../services/api';
import { formatFechaDoc, formatMonto, formatVendedor } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const COLUMNS = [
  { key: 'documento', title: 'Documento', width: 110, grow: true },
  { key: 'vence', title: 'Vence', width: 80 },
  { key: 'saldo', title: 'Saldo', width: 100, align: 'right' },
  { key: 'vendedor', title: 'Vendedor', width: 150, grow: true },
];

const ACCENT = colors.primary;
const claveFila = (item) => `${item.codTipo}|${item.documento}`;

// Saldo en la moneda del documento (IND_MON = 'D' → dólar; si no, local). Vendedor = agente dueño
// de la ruta del documento (igual que en el Calendario). tipo no es columna: se usa en la barra.
const aFila = (d) => {
  const enDolar = String(d.moneda).toUpperCase().startsWith('D');
  return {
    codTipo: d.codTipo,
    tipo: d.tipo,
    documento: d.documento,
    vence: formatFechaDoc(d.vence),
    saldo: formatMonto(enDolar ? d.saldoDocDolar : d.saldoDocLocal),
    vendedor: formatVendedor(d),
  };
};

// Menú Consultar > Documentos: documentos pendientes del cliente seleccionado (alCXC_PEN_COB,
// los mismos de Cobros; se descargan con Datos > Cargar datos).
// Al seleccionar un documento aparece el botón Imprimir: descarga su PDF del backend (requiere
// internet) y abre el menú del sistema para guardarlo o compartirlo (se imprime desde el celular).
export default function ConsultaDocumentosView({ cliente, ruta, onBack }) {
  const insets = useSafeAreaInsets();
  const [documentos, setDocumentos] = useState([]);
  const [error, setError] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    getDocumentosCobro({ cliente: cliente.codigo, ruta })
      .then((lista) => {
        if (!cancelado) setDocumentos(lista.map(aFila));
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudieron leer los documentos.');
      });
    return () => {
      cancelado = true;
    };
  }, [cliente.codigo, ruta]);

  const doc = documentos.find((d) => claveFila(d) === seleccionado) ?? null;

  const imprimir = async () => {
    if (!doc || generando) return;
    setGenerando(true);
    try {
      await descargarDocumentoPdf(doc.documento);
    } catch (e) {
      Alert.alert(
        'No se pudo descargar el PDF',
        isNetworkError(e)
          ? 'Debes estar conectado a internet para descargar el PDF del documento.'
          : e?.message || 'Intenta de nuevo.'
      );
    } finally {
      setGenerando(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Documentos" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
          <Text style={styles.clientMeta} numberOfLines={1}>
            {cliente.codigo}{ruta ? ` · Ruta ${ruta}` : ''}
          </Text>
        </View>

        <DataTable
          columns={COLUMNS}
          data={documentos}
          keyExtractor={claveFila}
          onRowPress={(item) => setSeleccionado(claveFila(item))}
          selectedKey={seleccionado}
          emptyText="El cliente no tiene documentos"
        />
        {doc ? (
          <Text style={styles.docInfo} selectable>
            Documento seleccionado: <Text style={styles.docInfoValue}>{doc.documento}</Text>
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      {doc ? (
        <View style={styles.bar}>
          <Pressable
            onPress={imprimir}
            disabled={generando}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            {generando ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Feather name="printer" size={20} color={colors.onPrimary} />
            )}
            <Text style={styles.actionText}>Imprimir</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  infoCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  clientMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  error: { fontSize: 12, color: colors.error },
  docInfo: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  docInfoValue: { fontWeight: '700', color: colors.text },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: {
    height: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: ACCENT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  pressed: { opacity: 0.8 },
});
