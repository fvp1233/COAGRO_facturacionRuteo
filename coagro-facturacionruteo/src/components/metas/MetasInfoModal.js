import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import { getDatosSesion, getVendedorMetas } from '../../repositories/metas';
import { colors, radius, spacing } from '../../theme';

// El usuario/handheld de la sesión pueden llegar como texto o como objeto: se toma un nombre legible.
const legible = (v, campos) => {
  if (v == null) return null;
  if (typeof v !== 'object') return String(v).trim() || null;
  for (const c of campos) {
    const valor = v[c];
    if (valor != null && String(valor).trim()) return String(valor).trim();
  }
  return null;
};

function Fila({ icono, label, valor, destacado }) {
  return (
    <View style={styles.fila}>
      <Feather name={icono} size={16} color={colors.textMuted} style={styles.filaIcono} />
      <View style={styles.filaTexts}>
        <Text style={styles.filaLabel}>{label}</Text>
        <Text style={[styles.filaValor, destacado && styles.filaDestacada]}>{valor}</Text>
      </View>
    </View>
  );
}

// Popup del botón de información de Metas: vendedor dueño de las metas (para confirmar que son las
// del usuario), usuario y handheld de la sesión, periodo y última descarga.
// Vendedor: código del ERP (result.vendedores, el de META_VENTA.VENDEDOR) y agente de ruteo
// (result.agentes, alias de la ruta) con su nombre; pueden ser códigos distintos (AG01 = VBV).
export default function MetasInfoModal({ visible, onClose, periodo, nombrePeriodo, ultimaSync }) {
  const [datos, setDatos] = useState(null);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelado = false;
    setDatos(null);
    Promise.all([getVendedorMetas(periodo?.anio, periodo?.mes), getDatosSesion()])
      .then(([vendedor, sesion]) => {
        if (!cancelado) setDatos({ vendedor, sesion });
      })
      .catch(() => {
        if (!cancelado) setDatos({ vendedor: { vendedores: [], agentes: [] }, sesion: null });
      });
    return () => {
      cancelado = true;
    };
  }, [visible, periodo]);

  const usuario = legible(datos?.sesion?.usuario, ['nombres', 'NOMBRES', 'nombre', 'NOMBRE', 'email', 'EMAIL']);
  const correo = legible(datos?.sesion?.usuario, ['email', 'EMAIL']);
  const vendedores = datos?.vendedor?.vendedores ?? [];
  const agentes = datos?.vendedor?.agentes ?? [];
  const nombre = agentes.map((a) => a.nombre).find(Boolean) ?? null;
  const handheld = legible(datos?.sesion?.handheld, ['HANDHELD', 'handheld', 'codigo', 'CODIGO', 'nombre', 'NOMBRE']);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.fondo} onPress={onClose}>
        <Pressable style={styles.caja} onPress={() => {}}>
          <View style={styles.header}>
            <Feather name="info" size={20} color={colors.primary} />
            <Text style={styles.titulo}>Información de las metas</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Feather name="x" size={20} color={colors.text} />
            </Pressable>
          </View>

          {!datos ? (
            <ActivityIndicator color={colors.primary} style={styles.loading} />
          ) : (
            <View style={styles.cuerpo}>
              {vendedores.length || agentes.length ? (
                <>
                  <Fila
                    icono="user-check"
                    label="Vendedor de las metas"
                    valor={nombre ?? (vendedores.length ? `Vendedor ${vendedores.join(', ')}` : 'Sin nombre en el equipo')}
                    destacado
                  />
                  <Fila
                    icono="hash"
                    label="Código de vendedor (ERP)"
                    valor={vendedores.length ? vendedores.join(', ') : 'No lo envió el servidor'}
                  />
                  {agentes.length ? (
                    <Fila icono="map" label="Agente de la ruta" valor={agentes.map((a) => a.codigo).join(', ')} />
                  ) : null}
                </>
              ) : (
                <Fila icono="user-x" label="Vendedor de las metas" valor="Sin metas descargadas" />
              )}
              {usuario ? (
                <Fila icono="user" label="Usuario de la sesión" valor={correo && correo !== usuario ? `${usuario}\n${correo}` : usuario} />
              ) : null}
              {handheld ? <Fila icono="smartphone" label="Handheld" valor={handheld} /> : null}
              <Fila icono="calendar" label="Periodo" valor={periodo ? nombrePeriodo(periodo) : '-'} />
              <Fila icono="download-cloud" label="Última descarga" valor={ultimaSync} />

              <Text style={styles.nota}>
                Las metas son las del vendedor asignado a la ruta de esta handheld. Si el vendedor no es el
                correcto, pide a soporte que revisen la asignación de la ruta.
              </Text>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  caja: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titulo: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  loading: { marginVertical: spacing.lg },
  cuerpo: { gap: spacing.sm + 2 },
  fila: { flexDirection: 'row', gap: spacing.sm + 2, alignItems: 'flex-start' },
  filaIcono: { marginTop: 2 },
  filaTexts: { flex: 1 },
  filaLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  filaValor: { fontSize: 14, color: colors.text, marginTop: 1 },
  filaDestacada: { fontSize: 16, fontWeight: '800' },
  nota: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
});
