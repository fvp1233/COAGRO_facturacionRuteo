import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

import Checkbox from '../ui/Checkbox';
import { Dato, DetalleSheet, Etiqueta, historialStyles } from '../historial/HistorialComun';
import { VIGENCIA } from '../../repositories/descuentos';
import { ALCANCE, DESTINO, getPromocionesCliente } from '../../repositories/promociones';
import { formatCantidad, formatFechaDoc, formatMonto, formatPorcentaje } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const h = historialStyles;

const VIGENCIAS = {
  [VIGENCIA.vigente]: { texto: 'Vigente', tono: 'verde', color: colors.success },
  [VIGENCIA.proximo]: { texto: 'Próxima', tono: 'ambar', color: colors.warning },
  [VIGENCIA.vencido]: { texto: 'Vencida', tono: 'rojo', color: colors.textDisabled },
};

const tituloPromo = (p) => p.titulo || `Promoción ${p.id}`;

// A qué artículos aplica un producto de la promoción, según ALCANCE.
function textoAlcance(p) {
  if (p.alcance === ALCANCE.articulo) return p.descripcion ? `${p.descripcion} (${p.valor})` : `Artículo ${p.valor}`;
  if (p.alcance === ALCANCE.linea) return `Línea ${p.valor}`;
  if (p.alcance === ALCANCE.texto) return `Artículos que contienen "${p.valor}"`;
  return p.valor;
}

// Beneficio del producto: descuento (%) y/o precio especial.
function textoBeneficio(p) {
  const partes = [];
  if (Number(p.descuento) > 0) partes.push(formatPorcentaje(p.descuento));
  if (p.precioEspecial != null) partes.push(`precio especial ${formatMonto(p.precioEspecial)}`);
  return partes.join(' o ') || 'Sin descuento';
}

const textoCantidad = (p) =>
  Number(p.cantidadMin) > 0 ? `Desde ${formatCantidad(p.cantidadMin)} unid.` : 'Cualquier cantidad';

// Fila de un producto de la promoción. seleccionable: radio para elegirlo en el popup.
function ProductoFila({ producto: p, atenuada, seleccionable = false, seleccionado = false, onPress }) {
  return (
    <Pressable
      disabled={!seleccionable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.producto,
        seleccionado && styles.productoSeleccionado,
        pressed && h.pressed,
      ]}
    >
      {seleccionable ? (
        <Feather
          name={seleccionado ? 'check-circle' : 'circle'}
          size={18}
          color={seleccionado ? colors.primary : colors.textDisabled}
        />
      ) : null}
      <View style={styles.flex}>
        <Text style={styles.productoNombre} numberOfLines={2}>{textoAlcance(p)}</Text>
        <Text style={styles.productoMeta}>{textoCantidad(p)}</Text>
      </View>
      <Text style={[styles.beneficio, atenuada && styles.atenuada]}>{textoBeneficio(p)}</Text>
    </Pressable>
  );
}

function Bonificacion({ promo }) {
  if (!promo.articuloBonificado) return null;
  return (
    <View style={styles.bonificacion}>
      <Feather name="gift" size={14} color={colors.success} />
      <Text style={styles.bonificacionText}>
        Bonificación: {formatCantidad(promo.cantidadBonificada ?? 0)} de{' '}
        {promo.bonificadoDescripcion || promo.articuloBonificado}
      </Text>
    </View>
  );
}

// Card de una promoción: título, descripción, vigencia, destino, productos y bonificación. Al
// tocarla se abre el popup para hacer un pedido o una cotización (igual que en Descuentos).
function PromocionCard({ promo, onPress }) {
  const v = VIGENCIAS[promo.vigencia];
  const vencida = promo.vigencia === VIGENCIA.vencido;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { borderLeftColor: v.color }, pressed && h.pressed]}
    >
      <View style={styles.cardTop}>
        <Text style={[h.cardNumero, styles.flex, vencida && styles.atenuada]} numberOfLines={3}>
          {tituloPromo(promo)}
        </Text>
        <Etiqueta texto={v.texto} tono={v.tono} />
        <Feather name="chevron-right" size={18} color={colors.textDisabled} />
      </View>
      {promo.descripcion ? <Text style={styles.descripcion}>{promo.descripcion}</Text> : null}
      <View style={h.cardMeta}>
        <Feather name="calendar" size={12} color={colors.textMuted} />
        <Text style={h.cardMetaText}>
          {formatFechaDoc(promo.fechaInicio) || '—'} al {formatFechaDoc(promo.fechaFin) || '—'}
        </Text>
        <Feather name={promo.destino === DESTINO.ruta ? 'map' : 'user'} size={12} color={colors.textMuted} />
        <Text style={h.cardMetaText}>{promo.destino === DESTINO.ruta ? 'Para la ruta' : 'Para el cliente'}</Text>
      </View>
      {promo.productos.map((p) => (
        <ProductoFila key={p.id} producto={p} atenuada={vencida} />
      ))}
      <Bonificacion promo={promo} />
    </Pressable>
  );
}

// Pestaña Promociones de Validar > Descuentos y promociones: promociones activas cuyo destino es el
// cliente o su ruta (guardadas en el equipo con Datos > Cargar datos), en cards.
// Al tocar una se abre un popup con Hacer pedido / Hacer cotización:
//   onHacerDocumento('pedido' | 'cotizacion', { articulo, cantMin }) abre la captura con el artículo
//   elegido ya seleccionado y la cantidad mínima de la promoción (articulo null = por línea o texto:
//   se abre la lista sin selección y el vendedor busca el artículo).
export default function PromocionesLista({ cliente, ruta, onHacerDocumento }) {
  const [promociones, setPromociones] = useState([]);
  const [descargado, setDescargado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ocultarVencidas, setOcultarVencidas] = useState(true);
  // Promoción tocada (abre el popup) y producto elegido dentro de ella.
  const [elegida, setElegida] = useState(null);
  const [productoId, setProductoId] = useState(null);

  useEffect(() => {
    let cancelado = false;
    getPromocionesCliente(cliente.codigo, ruta)
      .then((r) => {
        if (cancelado) return;
        setPromociones(r.promociones);
        setDescargado(r.descargado);
      })
      .catch((e) => {
        if (!cancelado) setError(e?.message || 'No se pudieron leer las promociones.');
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [cliente.codigo, ruta]);

  const vencidas = promociones.filter((p) => p.vigencia === VIGENCIA.vencido).length;
  const visibles = useMemo(
    () => promociones.filter((p) => !ocultarVencidas || p.vigencia !== VIGENCIA.vencido),
    [promociones, ocultarVencidas]
  );

  const abrir = (promo) => {
    // Por defecto, el primer producto de un artículo puntual (o el primero que haya).
    const inicial = promo.productos.find((p) => p.alcance === ALCANCE.articulo) ?? promo.productos[0];
    setProductoId(inicial?.id ?? null);
    setElegida(promo);
  };

  const producto = elegida?.productos.find((p) => p.id === productoId) ?? null;
  const porArticulo = producto?.alcance === ALCANCE.articulo;

  const hacer = (tipo) => {
    const p = producto;
    setElegida(null);
    onHacerDocumento?.(tipo, {
      articulo: p && p.alcance === ALCANCE.articulo ? p.valor : null,
      cantMin: p ? p.cantidadMin : 1,
    });
  };

  const vacio = cargando
    ? 'Cargando las promociones...'
    : !descargado
      ? 'No hay promociones descargadas. Ve a Datos > Cargar datos.'
      : promociones.length
        ? 'No hay promociones vigentes ni próximas'
        : 'Este cliente no tiene promociones';

  return (
    <>
      {error ? <Text style={h.error}>{error}</Text> : null}
      {vencidas ? (
        <Checkbox label={`Ocultar vencidas (${vencidas})`} checked={ocultarVencidas} onChange={setOcultarVencidas} />
      ) : null}

      {visibles.length ? (
        <View style={h.lista}>
          <Text style={h.contador}>
            {visibles.length} {visibles.length === 1 ? 'promoción' : 'promociones'}
          </Text>
          {visibles.map((p) => (
            <PromocionCard key={p.id} promo={p} onPress={() => abrir(p)} />
          ))}
        </View>
      ) : (
        <View style={h.empty}>
          {cargando ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Feather name="gift" size={28} color={colors.textDisabled} />
          )}
          <Text style={h.emptyText}>{vacio}</Text>
        </View>
      )}

      {/* Popup de la promoción: elegir el artículo (si hay varios) y hacer pedido o cotización. */}
      <DetalleSheet
        visible={Boolean(elegida)}
        tipo="PROMOCIÓN"
        numero={elegida ? tituloPromo(elegida) : ''}
        etiquetas={
          elegida ? <Etiqueta texto={VIGENCIAS[elegida.vigencia].texto} tono={VIGENCIAS[elegida.vigencia].tono} /> : null
        }
        onClose={() => setElegida(null)}
      >
        {elegida ? (
          <>
            {elegida.descripcion ? <Text style={styles.descripcion}>{elegida.descripcion}</Text> : null}
            <View style={h.datos}>
              <Dato
                label="Vigencia"
                value={`${formatFechaDoc(elegida.fechaInicio) || '—'} al ${formatFechaDoc(elegida.fechaFin) || '—'}`}
              />
              <Dato label="Para" value={elegida.destino === DESTINO.ruta ? 'La ruta' : 'El cliente'} />
            </View>

            <Text style={h.seccionLabel}>
              {elegida.productos.length > 1 ? 'ELIGE EL ARTÍCULO' : 'ARTÍCULO'}
            </Text>
            {elegida.productos.map((p) => (
              <ProductoFila
                key={p.id}
                producto={p}
                seleccionable={elegida.productos.length > 1}
                seleccionado={elegida.productos.length > 1 && p.id === productoId}
                onPress={() => setProductoId(p.id)}
              />
            ))}
            <Bonificacion promo={elegida} />

            {elegida.vigencia !== VIGENCIA.vigente ? (
              <Text style={h.aviso}>Esta promoción no está vigente hoy: el artículo se agregará sin ella.</Text>
            ) : null}
            {producto && !porArticulo ? (
              <Text style={h.aviso}>
                Esta promoción aplica a varios artículos: se abrirá la lista para que busques el artículo y la
                promoción se aplicará al agregarlo.
              </Text>
            ) : null}
            {!elegida.productos.length ? (
              <Text style={h.aviso}>Esta promoción no tiene artículos configurados.</Text>
            ) : null}

            {[
              { key: 'pedido', label: 'Hacer pedido', icon: 'shopping-cart' },
              { key: 'cotizacion', label: 'Hacer cotización', icon: 'file-text' },
            ].map((b) => (
              <Pressable
                key={b.key}
                onPress={() => hacer(b.key)}
                style={({ pressed }) => [h.printButton, pressed && h.pressed]}
              >
                <Feather name={b.icon} size={18} color={colors.onPrimary} />
                <Text style={h.printText}>{b.label}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </DetalleSheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    padding: spacing.sm + 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
  descripcion: { fontSize: 13, color: colors.text },
  producto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    padding: spacing.sm + 2,
  },
  productoSeleccionado: { borderColor: colors.primary },
  productoNombre: { fontSize: 13, fontWeight: '600', color: colors.text },
  productoMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  beneficio: { fontSize: 15, fontWeight: '800', color: colors.primary, textAlign: 'right', maxWidth: '45%' },
  bonificacion: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bonificacionText: { flex: 1, fontSize: 12, color: colors.text },
  atenuada: { opacity: 0.55 },
});
