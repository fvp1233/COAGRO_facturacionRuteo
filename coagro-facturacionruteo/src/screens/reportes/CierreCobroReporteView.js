import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import { TabsHistorial } from '../../components/historial/HistorialComun';
import { getNoCobradosHoy } from '../../repositories/cobros';
import { FORMAS_PAGO, getCierreCobroDia, getRecibo } from '../../repositories/pagos';
import { getRutasHandheld } from '../../repositories/rutaActiva';
import { imprimirCierreCobro, ORDEN_FORMAS, resumirCierre, resumirNoCobrados } from '../../services/cierreCobroPdf';
import { imprimirRecibo } from '../../services/reciboPdf';
import { formatFechaDoc, formatMonto, formatMontoMoneda } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const ICONO_FORMA = {
  EFECTIVO: 'cash',
  CHEQUE: 'checkbook',
  TRANSFERENCIA: 'bank-transfer',
  DEPOSITO: 'bank',
};

// 'YYYY-MM-DD HH:MM:SS' -> 'HH:MM'.
const hora = (v) => /\d{2}:\d{2}/.exec(String(v ?? '').slice(10))?.[0] ?? '';

const hoyLargo = () => new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

const de = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Saldo en la moneda del documento (IND_MON 'D...' = dólar).
const saldoTexto = (p) => formatMontoMoneda(p.saldo, String(p.moneda).toUpperCase().startsWith('D') ? 'D' : p.moneda);

function Seccion({ titulo, total, children }) {
  return (
    <View style={styles.seccionCard}>
      <View style={styles.seccionTop}>
        <Text style={styles.seccion}>{titulo}</Text>
        {total != null ? <Text style={styles.seccionTotal}>{formatMonto(total)}</Text> : null}
      </View>
      {children}
    </View>
  );
}

// Fila de un detalle (cheque, transferencia, cuenta): texto principal, secundario y monto.
function Fila({ principal, secundario, monto }) {
  return (
    <View style={styles.fila}>
      <View style={styles.flex}>
        <Text style={styles.filaPrincipal} numberOfLines={1}>{principal}</Text>
        {secundario ? <Text style={styles.filaSecundario} numberOfLines={2}>{secundario}</Text> : null}
      </View>
      <Text style={styles.filaMonto}>{formatMonto(monto)}</Text>
    </View>
  );
}

function Vacio({ icono, texto }) {
  return (
    <View style={styles.empty}>
      <Feather name={icono} size={28} color={colors.textDisabled} />
      <Text style={styles.emptyText}>{texto}</Text>
    </View>
  );
}

// Card de un recibo del día. Tocarla imprime el recibo.
function ReciboCard({ r, onPress }) {
  const estado = r.aplicado
    ? { texto: 'APLICADO', fondo: '#E3F2F1', color: colors.success }
    : r.enviado
      ? { texto: 'ENVIADO', fondo: '#E3F2F1', color: colors.success }
      : { texto: 'SIN ENVIAR', fondo: '#FEEBD3', color: '#B85F00' };
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { borderLeftColor: r.enviado ? colors.success : colors.warning }, pressed && styles.pressed]}
    >
      <View style={styles.flex}>
        <Text style={styles.cardTitulo} numberOfLines={1}>{r.recibo || 'Sin número'}</Text>
        <Text style={styles.cardCliente} numberOfLines={1}>
          {r.nombreCliente}{r.cliente && r.nombreCliente !== r.cliente ? ` (${r.cliente})` : ''}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          Documento {r.documento} · {r.cancelado ? 'cancelado' : 'abono'}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {r.formas.map((f) => FORMAS_PAGO[f.forma] ?? f.forma).join(' + ')}
        </Text>
        <View style={[styles.etiqueta, { backgroundColor: estado.fondo }]}>
          <Text style={[styles.etiquetaText, { color: estado.color }]}>{estado.texto}</Text>
        </View>
      </View>
      <View style={styles.cardDerecha}>
        <Text style={styles.cardMonto}>{formatMonto(r.monto)}</Text>
        <Text style={styles.cardHora}>{hora(r.fecha)}</Text>
        <Feather name="printer" size={14} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

// Card de un documento que faltó cobrar: cliente, documento, vencimiento, atraso y saldo.
function PendienteCard({ p }) {
  const hoy = p.dias === 0;
  return (
    <View style={[styles.card, { borderLeftColor: hoy ? colors.warning : colors.primary }]}>
      <View style={styles.flex}>
        <Text style={styles.cardTitulo} numberOfLines={1}>{p.nombre}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {p.cliente} · Ruta {p.ruta}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {p.tipo ? `${p.tipo} ` : 'Documento '}{p.documento} · vence {formatFechaDoc(p.vence) || '—'}
        </Text>
        <View style={[styles.etiqueta, { backgroundColor: hoy ? '#FEEBD3' : '#FDE3E2' }]}>
          <Text style={[styles.etiquetaText, { color: hoy ? '#B85F00' : '#A31A13' }]}>
            {hoy ? 'VENCE HOY' : `VENCIDO HACE ${p.dias} ${p.dias === 1 ? 'DÍA' : 'DÍAS'}`}
          </Text>
        </View>
      </View>
      <Text style={styles.cardMonto}>{saldoTexto(p)}</Text>
    </View>
  );
}

// Reportes > Cierre de Cobro: cuadre del día en el equipo, sin conexión.
//   Resumen: total, efectivo a entregar, total por forma de pago, cheques, transferencias / depósitos y
//            total por cuenta de banco.
//   Recibos: cada recibo del día (tocarlo lo imprime).
//   Por cobrar: lo que faltó cobrar hoy (documentos vencidos o que vencen hoy sin abono hoy; ver
//               getNoCobradosHoy).
// Imprimir cierre: PDF con todo lo anterior, armado en el equipo (services/cierreCobroPdf).
export default function CierreCobroReporteView({ onBack }) {
  const insets = useSafeAreaInsets();
  const [recibos, setRecibos] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [rutas, setRutas] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('resumen');
  const [generando, setGenerando] = useState(false);
  const imprimiendo = useRef(false);

  // Todo sale de la base local: se lee una vez al abrir la pantalla.
  useEffect(() => {
    let cancelado = false;
    Promise.all([getCierreCobroDia(), getNoCobradosHoy(), getRutasHandheld().catch(() => [])])
      .then(([r, p, listaRutas]) => {
        if (cancelado) return;
        setRecibos(r);
        setPendientes(p);
        setRutas(listaRutas.map((x) => x.codigo).filter(Boolean).join(', '));
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudo leer el cierre del día.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  const cierre = useMemo(() => resumirCierre(recibos), [recibos]);
  const faltante = useMemo(() => resumirNoCobrados(pendientes), [pendientes]);

  const tabs = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'recibos', label: `Recibos (${recibos.length})` },
    { key: 'pendientes', label: `Por cobrar (${pendientes.length})` },
  ];

  const imprimir = async (r) => {
    if (imprimiendo.current) return;
    imprimiendo.current = true;
    try {
      const recibo = await getRecibo(r.id);
      if (!recibo) throw new Error('El recibo ya no está en el equipo.');
      await imprimirRecibo(recibo);
    } catch (e) {
      Alert.alert('No se pudo generar el PDF', e?.message || 'Intenta de nuevo.');
    } finally {
      imprimiendo.current = false;
    }
  };

  const imprimirCierre = async () => {
    if (generando || imprimiendo.current) return;
    setGenerando(true);
    imprimiendo.current = true;
    try {
      await imprimirCierreCobro({ recibos, pendientes, rutas });
    } catch (e) {
      Alert.alert('No se pudo generar el PDF', e?.message || 'Intenta de nuevo.');
    } finally {
      imprimiendo.current = false;
      setGenerando(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader info={'Cuadre de lo cobrado hoy: efectivo a entregar, totales por forma de pago y por cuenta, los recibos del día y lo que faltó cobrar. Puedes imprimir el cierre.'} title="Cierre de Cobro" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.dia}>
          <MaterialCommunityIcons name="cash-check" size={22} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.diaTitulo}>Cierre del día</Text>
            <Text style={styles.diaFecha}>{hoyLargo()}</Text>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {cargando ? (
          <ActivityIndicator color={colors.primary} style={styles.loading} />
        ) : !error ? (
          <>
            <View style={styles.totales}>
              <View style={[styles.totalCard, styles.totalCobrado]}>
                <Text style={styles.totalLabel}>COBRADO HOY</Text>
                <Text style={styles.totalValor} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMonto(cierre.total)}
                </Text>
                <Text style={styles.totalMeta} numberOfLines={1}>
                  {de(recibos.length, 'recibo', 'recibos')} · {de(cierre.clientes, 'cliente', 'clientes')}
                </Text>
              </View>
              <Pressable
                onPress={() => setTab('pendientes')}
                style={({ pressed }) => [styles.totalCard, styles.totalFaltante, pressed && styles.pressed]}
              >
                <Text style={[styles.totalLabel, styles.faltanteText]}>FALTÓ COBRAR</Text>
                <Text style={[styles.totalValor, styles.faltanteValor]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatMonto(faltante.saldo)}
                </Text>
                <Text style={[styles.totalMeta, styles.faltanteText]} numberOfLines={1}>
                  {de(pendientes.length, 'documento', 'documentos')} · {de(faltante.clientes, 'cliente', 'clientes')}
                </Text>
              </Pressable>
            </View>

            {recibos.length ? (
              <View style={[styles.envio, cierre.sinEnviar ? styles.envioPendiente : styles.envioOk]}>
                <Feather
                  name={cierre.sinEnviar ? 'upload-cloud' : 'check-circle'}
                  size={16}
                  color={cierre.sinEnviar ? '#B85F00' : colors.success}
                />
                <Text style={[styles.envioText, { color: cierre.sinEnviar ? '#B85F00' : colors.success }]}>
                  {cierre.sinEnviar
                    ? `${de(cierre.sinEnviar, 'recibo sin enviar', 'recibos sin enviar')}: envíalos en Datos > Enviar datos.`
                    : 'Todos los recibos del día ya se enviaron.'}
                </Text>
              </View>
            ) : null}

            <TabsHistorial tab={tab} onChange={setTab} tabs={tabs} />

            {tab === 'resumen' ? (
              recibos.length ? (
                <>
                  <View style={styles.efectivo}>
                    <MaterialCommunityIcons name="cash" size={24} color={colors.success} />
                    <View style={styles.flex}>
                      <Text style={styles.efectivoLabel}>EFECTIVO A ENTREGAR</Text>
                      <Text style={styles.efectivoValor}>{formatMonto(cierre.efectivo)}</Text>
                    </View>
                  </View>

                  <Seccion titulo="POR FORMA DE PAGO" total={cierre.total}>
                    {ORDEN_FORMAS.filter((k) => cierre.formas[k]).map((k) => (
                      <View key={k} style={styles.formaFila}>
                        <MaterialCommunityIcons name={ICONO_FORMA[k]} size={18} color={colors.textMuted} />
                        <Text style={styles.formaNombre}>
                          {FORMAS_PAGO[k]} <Text style={styles.formaCantidad}>({cierre.formas[k].cantidad})</Text>
                        </Text>
                        <Text style={styles.formaMonto}>{formatMonto(cierre.formas[k].monto)}</Text>
                      </View>
                    ))}
                  </Seccion>

                  {cierre.cheques.length ? (
                    <Seccion titulo={`CHEQUES (${cierre.cheques.length})`} total={cierre.totalCheques}>
                      {cierre.cheques.map((c, i) => (
                        <Fila
                          key={`${c.recibo.id}|${i}`}
                          principal={`Cheque ${c.numeroCheque || 's/n'}${c.banco ? ` · ${c.banco}` : ''}`}
                          secundario={[
                            c.recibo.nombreCliente,
                            c.cuenta ? `Cuenta ${c.cuenta}` : null,
                            c.fecha ? `Fecha ${formatFechaDoc(c.fecha)}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                          monto={c.monto}
                        />
                      ))}
                    </Seccion>
                  ) : null}

                  {cierre.electronicos.length ? (
                    <Seccion
                      titulo={`TRANSFERENCIAS Y DEPÓSITOS (${cierre.electronicos.length})`}
                      total={cierre.totalElectronicos}
                    >
                      {cierre.electronicos.map((e, i) => (
                        <Fila
                          key={`${e.recibo.id}|${i}`}
                          principal={`${FORMAS_PAGO[e.forma] ?? e.forma}${e.transaccion ? ` · ${e.transaccion}` : ''}`}
                          secundario={`${e.recibo.nombreCliente} · Recibo ${e.recibo.recibo || 's/n'}`}
                          monto={e.monto}
                        />
                      ))}
                    </Seccion>
                  ) : null}

                  <Seccion titulo="POR CUENTA DE BANCO">
                    {cierre.cuentas.map((c) => (
                      <Fila
                        key={`${c.banco}|${c.cuenta}`}
                        principal={c.nombre || (c.cuenta ? `Cuenta ${c.cuenta}` : 'Sin cuenta')}
                        secundario={[c.banco ? `Banco ${c.banco}` : null, c.cuenta || null, de(c.recibos, 'recibo', 'recibos')]
                          .filter(Boolean)
                          .join(' · ')}
                        monto={c.monto}
                      />
                    ))}
                  </Seccion>
                </>
              ) : (
                <Vacio icono="dollar-sign" texto="Todavía no hay recibos registrados hoy." />
              )
            ) : tab === 'recibos' ? (
              recibos.length ? (
                recibos.map((r) => <ReciboCard key={r.id} r={r} onPress={() => imprimir(r)} />)
              ) : (
                <Vacio icono="dollar-sign" texto="Todavía no hay recibos registrados hoy." />
              )
            ) : (
              <>
                <Text style={styles.nota}>
                  Documentos vencidos o que vencen hoy, con saldo pendiente y sin ningún abono hoy. Los más
                  atrasados primero.
                </Text>
                {pendientes.length ? (
                  pendientes.map((p) => <PendienteCard key={p.clave} p={p} />)
                ) : (
                  <Vacio icono="check-circle" texto="No quedó nada vencido sin cobrar." />
                )}
              </>
            )}
          </>
        ) : null}
      </ScrollView>

      {!cargando && !error ? (
        <View style={styles.bar}>
          <Pressable
            onPress={imprimirCierre}
            disabled={generando}
            style={({ pressed }) => [styles.action, (pressed || generando) && styles.pressedAction]}
          >
            {generando ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Feather name="printer" size={20} color={colors.onPrimary} />
            )}
            <Text style={styles.actionText}>Imprimir cierre</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.md, gap: spacing.md },
  flex: { flex: 1 },
  loading: { marginVertical: spacing.lg },
  error: { fontSize: 13, color: colors.error },
  pressed: { opacity: 0.7 },
  seccion: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted },
  nota: { fontSize: 12, color: colors.textMuted },
  dia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  diaTitulo: { fontSize: 15, fontWeight: '700', color: colors.text },
  diaFecha: { fontSize: 12, color: colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
  totales: { flexDirection: 'row', gap: spacing.sm },
  totalCard: { flex: 1, borderRadius: radius.md, padding: spacing.sm + 4, gap: 2 },
  totalCobrado: { backgroundColor: colors.primary },
  totalFaltante: { backgroundColor: colors.background, borderWidth: 1, borderColor: '#F3C38B' },
  totalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.onPrimary, opacity: 0.9 },
  totalValor: { fontSize: 22, fontWeight: '800', color: colors.onPrimary, marginTop: 2 },
  totalMeta: { fontSize: 11, color: colors.onPrimary, opacity: 0.9 },
  faltanteText: { color: '#B85F00', opacity: 1 },
  faltanteValor: { color: colors.text },
  envio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  envioPendiente: { backgroundColor: '#FEEBD3' },
  envioOk: { backgroundColor: '#E3F2F1' },
  envioText: { flex: 1, fontSize: 12, fontWeight: '600' },
  efectivo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.success,
    padding: spacing.md,
  },
  efectivoLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.success },
  efectivoValor: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 2 },
  seccionCard: { backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm + 2 },
  seccionTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seccionTotal: { fontSize: 14, fontWeight: '800', color: colors.text },
  formaFila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  formaNombre: { flex: 1, fontSize: 13, color: colors.text },
  formaCantidad: { color: colors.textMuted },
  formaMonto: { fontSize: 13, fontWeight: '700', color: colors.text },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  filaPrincipal: { fontSize: 13, fontWeight: '600', color: colors.text },
  filaSecundario: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  filaMonto: { fontSize: 13, fontWeight: '700', color: colors.text },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.sm + 4,
  },
  cardTitulo: { fontSize: 14, fontWeight: '700', color: colors.text },
  cardCliente: { fontSize: 12, color: colors.text, marginTop: 1 },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  etiqueta: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: 4,
  },
  etiquetaText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  cardDerecha: { alignItems: 'flex-end', gap: 2 },
  cardMonto: { fontSize: 15, fontWeight: '800', color: colors.text },
  cardHora: { fontSize: 11, color: colors.textMuted },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  bar: {
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  action: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pressedAction: { opacity: 0.6 },
  actionText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
});
