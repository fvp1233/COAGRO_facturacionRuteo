import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import CenteredHeader from '../../components/ui/CenteredHeader';
import CuentaBancoSelect from '../../components/cobros/CuentaBancoSelect';
import { getCuentasBanco } from '../../repositories/cuentasBanco';
import { FORMAS_PAGO, MAX_NOTAS_RECIBO, getPagosDocumento, registrarPago } from '../../repositories/pagos';
import { formatMonto } from '../../utils/formato';
import { colors, radius, spacing } from '../../theme';

const METODOS = [
  { key: 'cheques', label: 'Cheques', icon: 'file-text' },
  { key: 'efectivo', label: 'Efectivo', icon: 'dollar-sign' },
  { key: 'transferencia', label: 'Transferencia', icon: 'repeat' },
  { key: 'deposito', label: 'Depósito', icon: 'briefcase' },
];

// Diferencias menores a medio centavo se toman como cero.
const EPS = 0.005;

// Texto de un campo de monto → número (acepta coma o punto como decimal). Vacío o inválido = 0.
const aNumero = (texto) => {
  const n = Number(String(texto ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Monto → texto para un campo (dos decimales, sin separador de miles).
const aTexto = (n) => (n > 0 ? (Math.round(n * 100) / 100).toFixed(2) : '');

const dos = (n) => String(n).padStart(2, '0');
const hoyTexto = () => {
  const d = new Date();
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// DD/MM/AAAA válida.
const fechaValida = (texto) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto ?? '');
  if (!m) return false;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return d.getDate() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1;
};

// 'YYYY-MM-DD HH:MM:SS' → 'DD/MM/YY HH:MM'.
const formatFechaHora = (v) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(v ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)} ${m[4]}:${m[5]}` : v ?? '';
};

let siguienteId = 1;
const chequeVacio = () => ({ id: siguienteId++, numero: '', banco: '', cuenta: '', fecha: hoyTexto(), monto: '' });

function Campo({ label, value, onChangeText, placeholder, keyboardType }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.campo}>
      <Text style={styles.campoLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        keyboardType={keyboardType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, focused && styles.inputFocused]}
      />
    </View>
  );
}

// Valor de solo lectura (montos calculados).
function Valor({ label, valor, fuerte, alerta }) {
  return (
    <View style={styles.campo}>
      <Text style={styles.campoLabel}>{label}</Text>
      <View style={[styles.readonly, fuerte && styles.readonlyFuerte]}>
        <Text
          style={[styles.readonlyText, fuerte && styles.readonlyTextFuerte, alerta && styles.textoAlerta]}
          numberOfLines={1}
        >
          {formatMonto(valor)}
        </Text>
      </View>
    </View>
  );
}

// Botón que pone en esta forma de pago lo que falta para completar el saldo del documento.
function Completar({ onPress, disabled }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.completar, disabled && styles.deshabilitado, pressed && styles.pressed]}
    >
      <Feather name="zap" size={14} color={colors.primary} />
      <Text style={styles.completarText}>Completar con el saldo</Text>
    </Pressable>
  );
}

// Fila "Forma ......... $monto" (desglose del pago y abonos anteriores).
function LineaMonto({ label, detalle, monto, fuerte }) {
  return (
    <View style={styles.linea}>
      <View style={styles.lineaTextos}>
        <Text style={[styles.lineaLabel, fuerte && styles.lineaFuerte]}>{label}</Text>
        {detalle ? <Text style={styles.lineaDetalle}>{detalle}</Text> : null}
      </View>
      <Text style={[styles.lineaMonto, fuerte && styles.lineaFuerte]}>{formatMonto(monto)}</Text>
    </View>
  );
}

const detalleCheque = (c) =>
  [c.numero && `Ch. ${c.numero}`, c.banco && c.banco.trim(), c.cuenta && `Cta. ${c.cuenta}`, c.fecha].filter(Boolean).join(' · ');

const detalleBancario = (forma, transaccion) =>
  transaccion ? (forma === 'DEPOSITO' ? `Boleta ${transaccion}` : `Trans. ${transaccion}`) : null;

// Pantalla de pago de un documento (Cobros > Documentos a cobrar > Pagar).
// - Pago híbrido: se pueden combinar cheques (varios), efectivo, transferencia y depósito; los montos
//   de todas las formas se suman en "pagado".
// - Abonos: se puede pagar solo una parte del saldo (documento de $100 → abona $20 → quedan $80).
//   Cada abono se guarda en el equipo (COBRO_PAGO) y el saldo del documento ya viene con los abonos
//   anteriores descontados, así que el siguiente pago parte del saldo que quedó.
// Montos:
// - Saldo total: suma de los saldos de todos los documentos pendientes del cliente.
// - Total a pagar: lo que se debe pagar de este documento (su saldo actual).
// - Saldo restante: total a pagar − pagado.
// - Saldo pendiente: saldo del documento − pagado (lo que le faltará pagar a este documento).
// Cada pago es un RECIBO (número = RUTA_CONSECUT_RT.RECIBO de la ruta) con UNA cuenta de banco: la
// de la transferencia/depósito del cliente o donde se depositará el efectivo y los cheques.
// onPagado({ idPago, recibo, pagado, saldoPendiente }) se llama después de guardar el pago.
// onVerRecibo(idPago) abre el recibo de un abono anterior.
export default function PagoView({
  cliente,
  ruta,
  documento,
  moneda,
  saldoTotal,
  saldoDocumento,
  totalAPagar,
  onBack,
  onPagado,
  onVerRecibo,
}) {
  const insets = useSafeAreaInsets();
  const [metodo, setMetodo] = useState('cheques');
  const [cheques, setCheques] = useState(() => [chequeVacio()]);
  const [efectivo, setEfectivo] = useState('');
  const [transferencia, setTransferencia] = useState({ monto: '', transaccion: '' });
  const [deposito, setDeposito] = useState({ monto: '', transaccion: '' });
  // Cuenta de banco del recibo ({ clave, compania, banco, cuenta, nombre, moneda }) o null.
  const [cuentaRecibo, setCuentaRecibo] = useState(null);
  const [abonos, setAbonos] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [guardando, setGuardando] = useState(false);
  // Notas del recibo (alCXC_ENC_DEP.NOTAS, máx. 80).
  const [notas, setNotas] = useState('');

  // Cuentas de banco de la compañía del documento (Datos > Cargar datos).
  useEffect(() => {
    let cancelado = false;
    getCuentasBanco({ compania: documento.compania })
      .then((lista) => {
        if (!cancelado) setCuentas(lista);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [documento.compania]);

  // Abonos ya registrados a este documento.
  useEffect(() => {
    let cancelado = false;
    getPagosDocumento({ cliente: cliente.codigo, ruta, codTipo: documento.codTipo, documento: documento.documento })
      .then((lista) => {
        if (!cancelado) setAbonos(lista);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [cliente.codigo, ruta, documento.codTipo, documento.documento]);

  const montos = useMemo(
    () => ({
      cheques: cheques.reduce((s, c) => s + aNumero(c.monto), 0),
      efectivo: aNumero(efectivo),
      transferencia: aNumero(transferencia.monto),
      deposito: aNumero(deposito.monto),
    }),
    [cheques, efectivo, transferencia.monto, deposito.monto],
  );
  const pagado = montos.cheques + montos.efectivo + montos.transferencia + montos.deposito;
  const saldoRestante = totalAPagar - pagado;
  const saldoPendiente = saldoDocumento - pagado;
  const formasUsadas = METODOS.filter((m) => montos[m.key] > 0);
  const completo = pagado > 0 && Math.abs(saldoPendiente) <= EPS;
  const abonadoAntes = abonos.reduce((s, a) => s + a.monto, 0);

  // Lo que le falta al pago sin contar lo que ya tiene la forma `key`.
  const faltaSin = (key) => Math.max(0, saldoDocumento - (pagado - montos[key]));

  const cambiarCheque = (id, campo, valor) =>
    setCheques((lista) => lista.map((c) => (c.id === id ? { ...c, [campo]: valor } : c)));

  // En cheques se completa el último cheque.
  const completarCheques = () => {
    const ultimo = cheques[cheques.length - 1];
    const falta = Math.max(0, saldoDocumento - (pagado - aNumero(ultimo.monto)));
    cambiarCheque(ultimo.id, 'monto', aTexto(falta));
  };

  const validar = () => {
    if (pagado <= 0) return 'Ingresa el monto de al menos una forma de pago.';
    if (!cuentaRecibo) return 'Selecciona la cuenta de banco del recibo.';
    if (pagado - saldoDocumento > EPS) {
      return `El monto pagado (${formatMonto(pagado)}) supera el saldo del documento (${formatMonto(saldoDocumento)}).`;
    }
    for (const c of cheques) {
      if (!aNumero(c.monto)) continue;
      if (!c.numero.trim() || !c.cuenta.trim()) return 'Cada cheque con monto debe tener número de cheque y número de cuenta.';
      if (!fechaValida(c.fecha)) return `La fecha del cheque ${c.numero} no es válida (DD/MM/AAAA).`;
    }
    for (const [nombre, t] of [['transferencia', transferencia], ['depósito', deposito]]) {
      if (!aNumero(t.monto)) continue;
      if (!t.transaccion.trim()) {
        return nombre === 'depósito'
          ? 'El depósito debe tener el número de boleta.'
          : 'La transferencia debe tener el número de transacción.';
      }
    }
    return null;
  };

  // Transferencia / depósito: van a la cuenta del recibo; se guarda su número o boleta.
  const formaBancaria = (forma, monto, datos) => ({ forma, monto, transaccion: datos.transaccion.trim() });

  // Formas de pago con monto, en el formato de COBRO_PAGO_DET.
  const formasDelPago = () => [
    ...cheques
      .filter((c) => aNumero(c.monto))
      .map((c) => ({
        forma: 'CHEQUE',
        monto: aNumero(c.monto),
        numeroCheque: c.numero.trim(),
        banco: c.banco.trim() || null,
        cuenta: c.cuenta.trim(),
        fecha: c.fecha,
      })),
    ...(montos.efectivo ? [{ forma: 'EFECTIVO', monto: montos.efectivo }] : []),
    ...(montos.transferencia ? [formaBancaria('TRANSFERENCIA', montos.transferencia, transferencia)] : []),
    ...(montos.deposito ? [formaBancaria('DEPOSITO', montos.deposito, deposito)] : []),
  ];

  const guardar = async () => {
    setGuardando(true);
    try {
      const { id, recibo } = await registrarPago({
        cliente: cliente.codigo,
        ruta,
        codTipo: documento.codTipo,
        documento: documento.documento,
        compania: documento.compania,
        moneda,
        cuenta: cuentaRecibo,
        notas,
        saldoAnterior: saldoDocumento,
        saldoServidor: moneda === 'Dólar' ? documento.saldoServidorDolar : documento.saldoServidorLocal,
        formas: formasDelPago(),
      });
      onPagado?.({ idPago: id, recibo, pagado, saldoPendiente: Math.max(0, saldoPendiente) });
    } catch (e) {
      Alert.alert('No se pudo guardar el pago', e?.message || 'Error al insertar en la base local.');
      setGuardando(false);
    }
  };

  const confirmar = () => {
    if (guardando) return;
    const error = validar();
    if (error) {
      Alert.alert('Revisa el pago', error);
      return;
    }
    const formas = formasUsadas.map((m) => `• ${m.label}: ${formatMonto(montos[m.key])}`).join('\n');
    const mensaje = completo
      ? `Se paga el documento ${documento.documento} por completo (${formatMonto(pagado)}).`
      : `Abono de ${formatMonto(pagado)} al documento ${documento.documento}.\nQuedarán pendientes ${formatMonto(saldoPendiente)}.`;
    Alert.alert(completo ? 'Confirmar pago' : 'Confirmar abono', `${mensaje}\n\n${formas}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: completo ? 'Pagar' : 'Abonar', onPress: guardar },
    ]);
  };

  // Transferencia y depósito tienen los mismos campos.
  const renderBancario = (key, datos, setDatos, etiqueta) => (
    <>
      <View style={styles.fila}>
        <Valor label="Total a pagar" valor={saldoTotal} />
        <Campo
          label={`Monto ${etiqueta}`}
          value={datos.monto}
          onChangeText={(v) => setDatos((d) => ({ ...d, monto: v }))}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
      </View>
      <Completar
        disabled={faltaSin(key) <= EPS}
        onPress={() => setDatos((d) => ({ ...d, monto: aTexto(faltaSin(key)) }))}
      />
      <View style={styles.fila}>
        <Valor label="Saldo restante" valor={saldoRestante} alerta={saldoRestante < -EPS} />
        <Valor label="Saldo pendiente" valor={saldoPendiente} alerta={saldoPendiente < -EPS} />
      </View>
      <Campo
        label={key === 'deposito' ? 'Número de boleta (solo dígitos)' : 'Número de transacción (solo dígitos)'}
        value={datos.transaccion}
        onChangeText={(v) => setDatos((d) => ({ ...d, transaccion: v.replace(/\D/g, '') }))}
        keyboardType="number-pad"
      />
    </>
  );

  const renderMetodo = () => {
    switch (metodo) {
      case 'cheques':
        return (
          <>
            {cheques.map((c, i) => (
              <View key={c.id} style={styles.cheque}>
                <View style={styles.chequeHeader}>
                  <Text style={styles.chequeTitulo}>Cheque {i + 1}</Text>
                  {cheques.length > 1 ? (
                    <Pressable hitSlop={10} onPress={() => setCheques((lista) => lista.filter((x) => x.id !== c.id))}>
                      <Feather name="trash-2" size={18} color={colors.primary} />
                    </Pressable>
                  ) : null}
                </View>
                <View style={styles.fila}>
                  <Campo label="Número de cheque" value={c.numero} onChangeText={(v) => cambiarCheque(c.id, 'numero', v)} keyboardType="number-pad" />
                  <Campo label="Banco del cheque" value={c.banco} onChangeText={(v) => cambiarCheque(c.id, 'banco', v)} />
                </View>
                <Campo label="Número de cuenta" value={c.cuenta} onChangeText={(v) => cambiarCheque(c.id, 'cuenta', v)} keyboardType="number-pad" />
                <View style={styles.fila}>
                  <Campo label="Fecha" value={c.fecha} onChangeText={(v) => cambiarCheque(c.id, 'fecha', v)} placeholder="DD/MM/AAAA" />
                  <Campo label="Monto" value={c.monto} onChangeText={(v) => cambiarCheque(c.id, 'monto', v)} placeholder="0.00" keyboardType="decimal-pad" />
                </View>
              </View>
            ))}
            <View style={styles.fila}>
              <Pressable
                onPress={() => setCheques((lista) => [...lista, chequeVacio()])}
                style={({ pressed }) => [styles.agregar, pressed && styles.pressed]}
              >
                <Feather name="plus" size={16} color={colors.primary} />
                <Text style={styles.agregarText}>Agregar cheque</Text>
              </Pressable>
            </View>
            <Completar
              disabled={Math.max(0, saldoDocumento - (pagado - aNumero(cheques[cheques.length - 1].monto))) <= EPS}
              onPress={completarCheques}
            />
            <View style={styles.fila}>
              <Valor label="Total de cheques" valor={montos.cheques} fuerte />
              <Valor label="Saldo pendiente" valor={saldoPendiente} alerta={saldoPendiente < -EPS} />
            </View>
          </>
        );
      case 'efectivo':
        return (
          <>
            <View style={styles.fila}>
              <Valor label="Total a pagar" valor={totalAPagar} />
              <Campo label="Monto efectivo" value={efectivo} onChangeText={setEfectivo} placeholder="0.00" keyboardType="decimal-pad" />
            </View>
            <Completar
              disabled={faltaSin('efectivo') <= EPS}
              onPress={() => setEfectivo(aTexto(faltaSin('efectivo')))}
            />
            <View style={styles.fila}>
              <Valor label="Saldo restante" valor={saldoRestante} alerta={saldoRestante < -EPS} />
              <Valor label="Saldo pendiente" valor={saldoPendiente} alerta={saldoPendiente < -EPS} />
            </View>
          </>
        );
      case 'transferencia':
        return renderBancario('transferencia', transferencia, setTransferencia, 'transferencia');
      default:
        return renderBancario('deposito', deposito, setDeposito, 'depósito');
    }
  };

  // Avance del pago sobre el saldo del documento (0..1).
  const avance = saldoDocumento > 0 ? Math.min(1, pagado / saldoDocumento) : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar style="dark" />
      <CenteredHeader title="Pagar" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.infoCard}>
          <Text style={styles.clientName} numberOfLines={1}>{cliente.nombre}</Text>
          <Text style={styles.clientMeta}>
            Documento {documento.documento} · Moneda {moneda}
          </Text>
          <View style={styles.saldoDoc}>
            <Text style={styles.saldoLabel}>SALDO DEL DOCUMENTO</Text>
            <Text style={styles.saldoDocValor}>{formatMonto(saldoDocumento)}</Text>
            {abonadoAntes > 0 ? (
              <Text style={styles.saldoNota}>Ya tiene {formatMonto(abonadoAntes)} abonados en este equipo</Text>
            ) : null}
          </View>
          <View style={styles.saldoTotalFila}>
            <Text style={styles.saldoTotalLabel}>Saldo total del cliente</Text>
            <Text style={styles.saldoTotalValor}>{formatMonto(saldoTotal)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <CuentaBancoSelect
            label="Cuenta de banco del recibo"
            cuentas={cuentas}
            value={cuentaRecibo?.clave ?? null}
            onChange={setCuentaRecibo}
          />
          <Text style={styles.lineaDetalle}>
            Donde entra el pago: la cuenta de la transferencia o del depósito del cliente, o donde se depositarán el efectivo y los cheques.
          </Text>
        </View>

        <Text style={styles.seccion}>Formas de pago</Text>
        <Text style={styles.ayuda}>
          Puedes combinar varias formas y pagar solo una parte (abono); lo que falte queda pendiente.
        </Text>
        <View style={styles.metodos}>
          {METODOS.map((m) => {
            const activo = m.key === metodo;
            const usado = montos[m.key] > 0;
            return (
              <Pressable
                key={m.key}
                onPress={() => setMetodo(m.key)}
                style={({ pressed }) => [styles.metodo, activo && styles.metodoActivo, pressed && styles.pressed]}
              >
                <View style={styles.metodoTop}>
                  <Feather name={m.icon} size={18} color={activo ? colors.onPrimary : colors.textMuted} />
                  {usado ? (
                    <Feather name="check-circle" size={16} color={activo ? colors.onPrimary : colors.success} />
                  ) : null}
                </View>
                <Text style={[styles.metodoText, activo && styles.metodoTextActivo]} numberOfLines={1}>
                  {m.label}
                </Text>
                <Text style={[styles.metodoMonto, activo && styles.metodoTextActivo]} numberOfLines={1}>
                  {usado ? formatMonto(montos[m.key]) : '—'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.card}>{renderMetodo()}</View>

        {formasUsadas.length ? (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitulo}>Desglose del pago</Text>
              {formasUsadas.length > 1 ? (
                <View style={styles.tag}>
                  <Text style={styles.tagText}>HÍBRIDO</Text>
                </View>
              ) : null}
            </View>
            {cheques
              .filter((c) => aNumero(c.monto))
              .map((c) => (
                <LineaMonto
                  key={c.id}
                  label="Cheque"
                  detalle={detalleCheque(c)}
                  monto={aNumero(c.monto)}
                />
              ))}
            {montos.efectivo ? <LineaMonto label="Efectivo" monto={montos.efectivo} /> : null}
            {montos.transferencia ? (
              <LineaMonto label="Transferencia" detalle={detalleBancario('TRANSFERENCIA', transferencia.transaccion)} monto={montos.transferencia} />
            ) : null}
            {montos.deposito ? (
              <LineaMonto label="Depósito" detalle={detalleBancario('DEPOSITO', deposito.transaccion)} monto={montos.deposito} />
            ) : null}
            <View style={styles.separador} />
            <LineaMonto label="Total pagado" monto={pagado} fuerte />
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitulo}>Notas del recibo</Text>
            <Text style={styles.lineaDetalle}>
              {notas.length}/{MAX_NOTAS_RECIBO}
            </Text>
          </View>
          <TextInput
            value={notas}
            onChangeText={setNotas}
            placeholder="Opcional: observaciones del cobro"
            placeholderTextColor={colors.textDisabled}
            maxLength={MAX_NOTAS_RECIBO}
            multiline
            style={styles.notas}
          />
        </View>

        {abonos.length ? (
          <View style={styles.card}>
            <Text style={styles.cardTitulo}>Abonos anteriores</Text>
            {abonos.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => onVerRecibo?.(a.id)}
                disabled={!onVerRecibo}
                style={({ pressed }) => [styles.abono, pressed && styles.pressed]}
              >
                <LineaMonto
                  label={`${a.recibo ? `Recibo ${a.recibo} · ` : ''}${formatFechaHora(a.fecha)}`}
                  detalle={a.formas.map((f) => FORMAS_PAGO[f.forma] ?? f.forma).join(' + ')}
                  monto={a.monto}
                  fuerte
                />
                {a.saldoNuevo != null ? (
                  <Text style={styles.lineaDetalle}>Saldo después del abono: {formatMonto(Math.max(0, a.saldoNuevo))}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.totales}>
          <View>
            <Text style={styles.saldoLabel}>TOTAL A PAGAR</Text>
            <Text style={styles.totalValor}>{formatMonto(totalAPagar)}</Text>
          </View>
          <View style={styles.totalDerecha}>
            <Text style={styles.saldoLabel}>SALDO PENDIENTE</Text>
            <Text style={[styles.totalValor, saldoPendiente < -EPS && styles.textoAlerta]}>
              {formatMonto(saldoPendiente)}
            </Text>
          </View>
        </View>
        <View style={styles.barra}>
          <View style={[styles.barraAvance, { width: `${avance * 100}%` }]} />
        </View>
        <Text style={styles.pagadoText}>
          Pagado {formatMonto(pagado)}
          {pagado > 0 && !completo && saldoPendiente > 0 ? ' · Abono parcial' : ''}
          {completo ? ' · Pago completo' : ''}
        </Text>
        <Pressable
          onPress={confirmar}
          disabled={guardando}
          style={({ pressed }) => [styles.payButton, guardando && styles.deshabilitado, pressed && styles.pressed]}
        >
          {guardando ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Feather name="check" size={22} color={colors.onPrimary} />
          )}
          <Text style={styles.payText}>{pagado > 0 && !completo ? 'Abonar' : 'Pagar'}</Text>
        </Pressable>
      </View>
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
    borderWidth: 1,
    borderColor: colors.border,
  },
  clientName: { fontSize: 15, fontWeight: '700', color: colors.text },
  clientMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  saldoDoc: {
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saldoLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.textMuted },
  saldoDocValor: { fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 2 },
  saldoNota: { fontSize: 11, color: colors.success, marginTop: 2, fontWeight: '600' },
  saldoTotalFila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderRadius: radius.sm + 2,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  saldoTotalLabel: { fontSize: 12, color: colors.textMuted },
  saldoTotalValor: { fontSize: 14, fontWeight: '700', color: colors.text },
  seccion: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: -spacing.sm },
  ayuda: { fontSize: 12, color: colors.textMuted, marginBottom: -spacing.xs },
  metodos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metodo: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm + 4,
    gap: 2,
  },
  metodoActivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  metodoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metodoText: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 4 },
  metodoMonto: { fontSize: 12, color: colors.textMuted },
  metodoTextActivo: { color: colors.onPrimary },
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm + 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitulo: { fontSize: 14, fontWeight: '700', color: colors.text },
  tag: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  tagText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  fila: { flexDirection: 'row', gap: spacing.sm },
  campo: { flex: 1 },
  campoLabel: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.xs },
  input: {
    height: 44,
    borderRadius: radius.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    fontSize: 14,
    color: colors.text,
  },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.background },
  notas: {
    minHeight: 64,
    borderRadius: radius.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
  },
  readonly: {
    height: 44,
    borderRadius: radius.sm + 2,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 2,
    justifyContent: 'center',
  },
  readonlyFuerte: { backgroundColor: colors.primarySoft },
  readonlyText: { fontSize: 14, fontWeight: '600', color: colors.text },
  readonlyTextFuerte: { fontWeight: '800', color: colors.primaryDark },
  textoAlerta: { color: '#A31A13' },
  completar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  completarText: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
  cheque: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm + 4,
    gap: spacing.sm + 2,
  },
  chequeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chequeTitulo: { fontSize: 13, fontWeight: '700', color: colors.text },
  agregar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
  },
  agregarText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  linea: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  lineaTextos: { flex: 1 },
  lineaLabel: { fontSize: 14, color: colors.text },
  lineaDetalle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  lineaMonto: { fontSize: 14, fontWeight: '600', color: colors.text },
  lineaFuerte: { fontWeight: '800' },
  separador: { height: 1, backgroundColor: colors.border },
  abono: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm + 2,
    padding: spacing.sm + 2,
  },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totales: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  totalDerecha: { alignItems: 'flex-end' },
  totalValor: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 1 },
  barra: { height: 6, borderRadius: radius.pill, backgroundColor: colors.surface, overflow: 'hidden' },
  barraAvance: { height: '100%', backgroundColor: colors.success },
  pagadoText: { fontSize: 12, color: colors.textMuted },
  payButton: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  payText: { fontSize: 15, fontWeight: '700', color: colors.onPrimary },
  deshabilitado: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
