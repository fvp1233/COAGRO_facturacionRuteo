import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import { getClienteConsulta } from '../../repositories/clientes';
import { formatMonto, formatPorcentaje } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const NO_DISPONIBLE = 'No disponible';

// Contacto / teléfono: pueden venir null, " " o "ND" desde el ERP.
const textoOSin = (v, sin) => {
  const t = String(v ?? '').trim();
  return !t || t.toUpperCase() === 'ND' ? sin : t;
};

// DIA_CRE: 0 = contado.
const diasCredito = (n) => (n == null ? null : Number(n) === 0 ? 'Contado' : `${n} días`);

// IND_MON: L = local, D = dólar.
const moneda = (v) => {
  const m = String(v ?? '').trim().toUpperCase();
  if (!m) return null;
  if (m.startsWith('L')) return 'Local';
  if (m.startsWith('D')) return 'Dólar';
  return m;
};

// Menú Consultar > Cliente: ficha del cliente, solo lectura (base local; se descarga en
// Datos > Cargar datos).
export default function ConsultaClienteView({ cliente, ruta, onBack }) {
  const insets = useSafeAreaInsets();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    getClienteConsulta(cliente.codigo, ruta)
      .then((d) => {
        if (cancelado) return;
        setDatos(d);
        if (!d) setError('El cliente no está en la base local. Descarga los datos en Datos > Cargar datos.');
      })
      .catch(() => {
        if (!cancelado) setError('No se pudo leer el cliente de la base local.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente.codigo, ruta]);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Cliente" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        {cargando ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : null}
        {error ? <Text style={styles.warning}>{error}</Text> : null}

        {datos ? (
          <>
            <View style={styles.card}>
              <Field label="Código" value={datos.codigo} />
              <Field label="Nombre" value={datos.nombre} />
              <Field label="Dirección" value={datos.direccion} lines={3} />
              <View style={styles.row}>
                <Field
                  label="Contacto"
                  value={datos.tieneDatosComerciales ? textoOSin(datos.contacto, 'Sin contacto') : null}
                  style={styles.half}
                />
                <Field
                  label="Teléfono"
                  value={datos.tieneDatosComerciales ? textoOSin(datos.telefono, 'Sin teléfono') : null}
                  style={styles.half}
                />
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.row}>
                <Field label="Tipo cliente" value={datos.tipoCliente} style={styles.half} />
                <Field label="Nivel de precio" value={datos.nivelPrecio} style={styles.half} />
              </View>
              <Field label="Día de visita" value={datos.diasVisita.join(', ')} />
              <View style={styles.row}>
                <Field label="Días de crédito" value={diasCredito(datos.diasCredito)} style={styles.half} />
                <Field label="Límite de crédito" value={formatMonto(datos.limiteCredito)} style={styles.half} />
              </View>
            </View>

            <View style={styles.card}>
              <View style={styles.row}>
                <Field label="Exento imp. ventas" value={formatPorcentaje(datos.exentoVentas)} style={styles.half} />
                <Field
                  label="Exento imp. selec. cons."
                  value={formatPorcentaje(datos.exentoSelectivo)}
                  style={styles.half}
                />
              </View>
              <View style={styles.row}>
                <Field label="Facturas pendientes" value={datos.facturasPendientes ? 'Sí' : 'No'} style={styles.half} />
                <Field label="Tipo de moneda" value={moneda(datos.moneda)} style={styles.half} />
              </View>
              <Field label="Desc. general" value={formatPorcentaje(datos.descuento)} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Field({ label, value, style, lines = 2 }) {
  const vacio = value === null || value === undefined || value === '';
  return (
    <View style={style}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.readonly}>
        <Text style={[styles.value, vacio && styles.vacio]} numberOfLines={lines}>
          {vacio ? NO_DISPONIBLE : String(value)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F5FA' },
  content: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  label: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.xs },
  readonly: {
    minHeight: 42,
    borderRadius: radius.sm + 2,
    backgroundColor: '#F3F5F9',
    paddingHorizontal: spacing.sm + 2,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  value: { fontSize: 14, color: colors.textPrimary },
  vacio: { color: colors.placeholder, fontStyle: 'italic' },
  warning: {
    fontSize: 13,
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  loading: { marginTop: spacing.lg },
});
