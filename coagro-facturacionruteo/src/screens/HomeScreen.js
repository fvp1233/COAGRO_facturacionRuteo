import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Feather } from '@expo/vector-icons';

import ModuleCard from '../components/home/ModuleCard';
import RutaActivaPicker from '../components/rutas/RutaActivaPicker';
import { MODULES } from '../constants/modules';
import { getRutaActiva, getRutasHandheld, setRutaActiva } from '../repositories/rutaActiva';
import { readConfig } from '../services/localConfig';
import { colors, radius, spacing } from '../theme';

const COLUMNS = 2;

export default function HomeScreen({ onOpenModule, onLogout }) {
  const insets = useSafeAreaInsets();
  const [rutas, setRutas] = useState([]);
  const [rutaActiva, setRutaActivaState] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [handheld, setHandheld] = useState(null);

  // Handheld configurada en este equipo (JSON de la pantalla de Conexión).
  useEffect(() => {
    let cancelado = false;
    readConfig().then((config) => {
      if (!cancelado) setHandheld(config?.connection?.handheld ?? null);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  // Ruta activa: con una sola ruta se usa esa; con varias y ninguna elegida, se pide elegir.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const lista = await getRutasHandheld();
      const activa = await getRutaActiva(lista);
      if (cancelado) return;
      setRutas(lista);
      setRutaActivaState(activa);
    })().catch(() => {
      // sin base local aún: no hay rutas que mostrar
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const debeElegir = rutas.length > 1 && !rutaActiva;

  const elegirRuta = async (ruta) => {
    await setRutaActiva(ruta.codigo);
    setRutaActivaState(ruta);
    setPickerOpen(false);
  };

  const rows = [];
  for (let i = 0; i < MODULES.length; i += COLUMNS) {
    rows.push(MODULES.slice(i, i + COLUMNS));
  }

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.md },
      ]}
    >
      <StatusBar style="dark" />

      <View style={styles.topBar}>
        <View style={styles.chip}>
          <Feather name="smartphone" size={14} color={colors.textPrimary} />
          <Text style={styles.chipText} numberOfLines={1}>
            {handheld ? `Handheld ${handheld}` : 'Handheld sin configurar'}
          </Text>
        </View>
        <Pressable
          onPress={() => setMenuOpen(true)}
          hitSlop={8}
          accessibilityLabel="Más opciones"
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Feather name="more-vertical" size={18} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.grid}>
        {rows.map((row, index) => (
          <View key={index} style={styles.row}>
            {row.map((module) => (
              <ModuleCard
                key={module.id}
                {...module}
                style={styles.cell}
                onPress={() => onOpenModule?.(module)}
              />
            ))}
          </View>
        ))}
      </View>

      <RutaActivaPicker
        visible={debeElegir || pickerOpen}
        rutas={rutas}
        actual={rutaActiva}
        obligatorio={debeElegir}
        onSelect={elegirRuta}
        onClose={() => setPickerOpen(false)}
      />

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menu, { top: insets.top + spacing.sm + 44 }]}>
            {rutas.length > 1 ? (
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  setPickerOpen(true);
                }}
                style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              >
                <Feather name="map-pin" size={16} color={colors.textPrimary} />
                <View style={styles.menuTexts}>
                  <Text style={styles.menuText}>Cambiar ruta</Text>
                  {rutaActiva ? (
                    <Text style={styles.menuDetail} numberOfLines={1}>{rutaActiva.label}</Text>
                  ) : null}
                </View>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                onLogout?.();
              }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Feather name="log-out" size={16} color="#DC2626" />
              <Text style={[styles.menuText, styles.menuDanger]}>Cerrar sesión</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F6F8F6',
    paddingHorizontal: spacing.md,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  chipText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.15)',
  },
  menu: {
    position: 'absolute',
    right: spacing.md,
    minWidth: 200,
    maxWidth: 280,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  menuItemPressed: {
    backgroundColor: '#F1F5F9',
  },
  menuTexts: {
    flexShrink: 1,
  },
  menuText: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  menuDetail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  menuDanger: {
    color: '#DC2626',
    fontWeight: '600',
  },
  grid: {
    flex: 1,
    gap: spacing.md,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  cell: {
    flex: 1,
  },
});
