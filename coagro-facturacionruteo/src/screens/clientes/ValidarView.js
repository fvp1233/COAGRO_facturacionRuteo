import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';

import ScreenHeader from '../../components/ui/ScreenHeader';
import SelectField from '../../components/ui/SelectField';
import Checkbox from '../../components/ui/Checkbox';
import ClientTable from '../../components/clientes/ClientTable';
import UbicacionMenu from '../../components/clientes/UbicacionMenu';
import { DIAS, DIAS_FILTRO, ESTADOS } from '../../data/clientes';
import { getClientesRuta, getRutas, getUbicacionCliente, guardarUbicacionCliente } from '../../repositories/clientes';
import { getRutaActiva } from '../../repositories/rutaActiva';
import { colors, radius, spacing } from '../../theme';
import { normalizar } from '../../utils/text';

const ACCENT = colors.primary;

const SEARCH_MODES = {
  codigo: { label: 'Código', icon: 'hash', placeholder: 'Buscar por código...', field: 'codigo' },
  nombre: { label: 'Nombre', icon: 'user', placeholder: 'Buscar por nombre...', field: 'nombre' },
};

// Día inicial del filtro: el día actual (Lunes..Sábado). El domingo no tiene ruta, así que sale "Todos".
const diaDeHoy = () => DIAS[new Date().getDay() - 1] ?? DIAS_FILTRO[0];

// onSelectCliente(cliente, rutaCodigo) avisa al contenedor qué cliente está seleccionado; el botón
// Validar del menú inferior lo usa. initialRutaCodigo / initialSelectedCodigo restauran la selección
// al volver desde la página de opciones.
export default function ValidarView({
  onBack,
  onSelectCliente,
  initialRutaCodigo = null,
  initialSelectedCodigo = null,
  refreshKey = 0,
}) {
  const [searchMode, setSearchMode] = useState('codigo');
  const [query, setQuery] = useState('');
  const [rutas, setRutas] = useState([]);
  const [rutaLabel, setRutaLabel] = useState('');
  const [dia, setDia] = useState(diaDeHoy);
  const [estado, setEstado] = useState(ESTADOS[0]);
  const [ordenAlfabetico, setOrdenAlfabetico] = useState(true);
  const [selectedCodigo, setSelectedCodigo] = useState(initialSelectedCodigo);
  const [filas, setFilas] = useState([]);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [ubicacion, setUbicacion] = useState(null);

  const mode = SEARCH_MODES[searchMode];
  const rutaCodigo = rutas.find((r) => r.label === rutaLabel)?.codigo ?? null;

  // Rutas disponibles (se recargan después de sincronizar).
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const lista = await getRutas();
        const activa = await getRutaActiva();
        if (cancelado) return;
        setRutas(lista);
        // Se respeta la ruta ya elegida; si no, la que se traía o la ruta activa.
        setRutaLabel((actual) => {
          if (lista.some((r) => r.label === actual)) return actual;
          const inicial =
            lista.find((r) => r.codigo === initialRutaCodigo) ?? lista.find((r) => r.codigo === activa?.codigo);
          return inicial?.label ?? lista[0]?.label ?? '';
        });
        setError('');
      } catch {
        if (!cancelado) setError('No se pudo leer la base local.');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [refreshKey]);

  // Clientes de la ruta, día y estado elegidos.
  useEffect(() => {
    let cancelado = false;
    if (!rutaCodigo) {
      setFilas([]);
      return undefined;
    }
    (async () => {
      try {
        const lista = await getClientesRuta({
          ruta: rutaCodigo,
          dia: dia === DIAS_FILTRO[0] ? null : DIAS.indexOf(dia) + 1,
          estado,
        });
        if (!cancelado) setFilas(lista);
      } catch {
        if (!cancelado) setError('No se pudo leer la base local.');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [rutaCodigo, dia, estado, refreshKey]);

  const clientes = useMemo(() => {
    const q = normalizar(query);
    const filtered = q ? filas.filter((c) => normalizar(c[mode.field]).includes(q)) : filas;
    // Sin orden alfabético se respeta el orden de visita de la ruta (ORDEN).
    return ordenAlfabetico
      ? [...filtered].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      : filtered;
  }, [filas, query, mode.field, ordenAlfabetico]);

  const selected = filas.find((c) => c.codigo === selectedCodigo);

  // Coordenadas guardadas del cliente seleccionado.
  useEffect(() => {
    let cancelado = false;
    setUbicacion(null);
    if (!selectedCodigo || !rutaCodigo) return undefined;
    getUbicacionCliente(rutaCodigo, selectedCodigo)
      .then((u) => {
        if (!cancelado) setUbicacion(u);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [selectedCodigo, rutaCodigo, refreshKey]);

  const irAlDestino = async () => {
    if (!ubicacion) {
      Alert.alert('Sin coordenadas', 'Este cliente aún no tiene coordenadas. Usa "Asignar coordenadas" primero.');
      return;
    }
    const { latitud, longitud } = ubicacion;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${latitud},${longitud}&travelmode=driving`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('No se pudo abrir el mapa', 'Verifica que tengas Google Maps o un navegador instalado.');
    }
  };

  const asignarCoordenadas = async () => {
    try {
      const permiso = await Location.requestForegroundPermissionsAsync();
      if (permiso.status !== 'granted') {
        Alert.alert('Permiso denegado', 'Activa el permiso de ubicación para asignar coordenadas.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const nueva = {
        latitud: pos.coords.latitude,
        longitud: pos.coords.longitude,
        altitud: pos.coords.altitude ?? null,
      };
      Alert.alert(
        'Asignar coordenadas',
        `${selected.nombre}\n\nLatitud: ${nueva.latitud.toFixed(6)}\nLongitud: ${nueva.longitud.toFixed(6)}\n\n¿Guardar tu ubicación actual para este cliente?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Guardar',
            onPress: async () => {
              try {
                await guardarUbicacionCliente(rutaCodigo, selected.codigo, nueva);
                setUbicacion(nueva);
              } catch {
                Alert.alert('Error', 'No se pudieron guardar las coordenadas.');
              }
            },
          },
        ],
      );
    } catch {
      Alert.alert('Error', 'No se pudo obtener la ubicación. Verifica que el GPS esté activado.');
    }
  };

  const handleMenu = (opcion) => {
    setMenuOpen(false);
    if (opcion === 'ir') irAlDestino();
    else asignarCoordenadas();
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Clientes" onBack={onBack} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.search}>
          <Pressable
            style={styles.searchMode}
            onPress={() => setSearchMode(searchMode === 'codigo' ? 'nombre' : 'codigo')}
          >
            <Feather name={mode.icon} size={16} color={ACCENT} />
            <Text style={styles.searchModeText}>{mode.label}</Text>
            <Feather name="chevron-down" size={14} color={colors.text} />
          </Pressable>
          <TextInput
            style={styles.searchInput}
            placeholder={mode.placeholder}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query ? (
            <Pressable style={styles.clear} onPress={() => setQuery('')} hitSlop={8}>
              <Feather name="x" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filters}>
          <SelectField
            label="Ruta"
            value={rutaLabel || 'Sin rutas'}
            options={rutas.map((r) => r.label)}
            onChange={setRutaLabel}
            style={styles.filter}
          />
          <SelectField label="Día" value={dia} options={DIAS_FILTRO} onChange={setDia} style={styles.filter} />
          <SelectField label="Estado" value={estado} options={ESTADOS} onChange={setEstado} style={styles.filter} />
        </View>

        <View style={styles.optionsRow}>
          <Checkbox label="Ordenar alfabéticamente" checked={ordenAlfabetico} onChange={setOrdenAlfabetico} />
          <View style={styles.countChip}>
            <Feather name="users" size={12} color={colors.textMuted} />
            <Text style={styles.countText}>{clientes.length} clientes encontrados</Text>
          </View>
        </View>

        {error ? <Text style={styles.warning}>{error}</Text> : null}
        {!error && rutas.length === 0 ? (
          <Text style={styles.warning}>
            Aún no hay datos en este equipo. Ve a Datos > Cargar datos para descargar los clientes.
          </Text>
        ) : null}

        <ClientTable
          clientes={clientes}
          selectedCodigo={selectedCodigo}
          onSelect={(c) => {
            setSelectedCodigo(c.codigo);
            onSelectCliente?.(c, rutaCodigo);
          }}
        />

        {selected ? (
          <View style={styles.address}>
            <View style={styles.addressIcon}>
              <Feather name="map-pin" size={18} color={ACCENT} />
            </View>
            <View style={styles.addressTexts}>
              <Text style={styles.addressLabel}>DIRECCIÓN / FINCA GANADERA</Text>
              <Text style={styles.addressText}>{selected.direccion}</Text>
            </View>
            <Pressable
              onPress={() => setMenuOpen(true)}
              hitSlop={8}
              style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed]}
            >
              <MaterialCommunityIcons name="google-maps" size={24} color={colors.onPrimary} />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <UbicacionMenu visible={menuOpen} onClose={() => setMenuOpen(false)} onSelect={handleMenu} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  warning: {
    fontSize: 13,
    color: colors.error,
    backgroundColor: colors.errorSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  search: {
    flexDirection: 'row',
    height: 48,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  searchMode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 4,
    backgroundColor: colors.surface,
  },
  searchModeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: spacing.sm + 2,
    fontSize: 15,
    color: colors.text,
  },
  clear: {
    justifyContent: 'center',
    paddingHorizontal: spacing.sm + 2,
  },
  filters: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filter: {
    flex: 1,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -spacing.xs,
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  countText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  address: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapButtonPressed: { opacity: 0.8 },
  addressTexts: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.textMuted,
    marginBottom: 2,
  },
  addressText: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
});
