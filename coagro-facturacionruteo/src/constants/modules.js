import { colors } from '../theme';

// Módulos del menú principal.
export const MODULES = [
  {
    id: 'clientes',
    title: 'Clientes',
    subtitle: 'Directorio y créditos',
    icon: { family: 'Feather', name: 'users' },
    palette: {
      accent: colors.primary,
      gradient: [colors.primary, colors.primaryPressed],
      tint: colors.surface,
      border: colors.border,
    },
  },
  {
    id: 'presupuesto',
    title: 'Metas',
    subtitle: 'Cómo voy con mis metas de venta',
    icon: { family: 'MaterialCommunityIcons', name: 'bullseye-arrow' },
    palette: {
      accent: colors.primary,
      gradient: [colors.primary, colors.primaryPressed],
      tint: colors.surface,
      border: colors.border,
    },
  },
  {
    id: 'reportes',
    title: 'Reportes',
    subtitle: 'Ventas y liquidación',
    icon: { family: 'Feather', name: 'trending-up' },
    palette: {
      accent: colors.primary,
      gradient: [colors.primary, colors.primaryPressed],
      tint: colors.surface,
      border: colors.border,
    },
  },
  {
    id: 'datos',
    title: 'Datos',
    subtitle: 'Catálogo y precios',
    icon: { family: 'Feather', name: 'database' },
    palette: {
      accent: colors.primary,
      gradient: [colors.primary, colors.primaryPressed],
      tint: colors.surface,
      border: colors.border,
    },
  },
  {
    id: 'parametros',
    title: 'Parámetros',
    subtitle: 'Impresora y sistema',
    icon: { family: 'Feather', name: 'sliders' },
    palette: {
      accent: colors.primary,
      gradient: [colors.primary, colors.primaryPressed],
      tint: colors.surface,
      border: colors.border,
    },
  },
  {
    id: 'calendario',
    title: 'Calendario',
    subtitle: 'Vencimientos de documentos',
    icon: { family: 'MaterialCommunityIcons', name: 'calendar-month-outline' },
    palette: {
      accent: colors.primary,
      gradient: [colors.primary, colors.primaryPressed],
      tint: colors.surface,
      border: colors.border,
    },
  },
];
