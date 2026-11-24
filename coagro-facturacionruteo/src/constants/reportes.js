import { colors } from '../theme';

// Opciones del módulo Reportes (pantalla ReportesScreen).
export const REPORTES = [
  {
    id: 'monto-cobrado-vendido',
    title: 'Cobrado y Vendido',
    subtitle: 'Montos del día',
    icon: 'cash-multiple',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'cierre-cobro',
    title: 'Cierre de Cobro',
    subtitle: 'Recibos del día',
    icon: 'cash-check',
    palette: { accent: colors.primary, iconColor: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'visitas',
    title: 'Visitas',
    subtitle: 'Mi día',
    icon: 'map-marker-check',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'inventario',
    title: 'Inventario',
    subtitle: 'Stock camión',
    icon: 'archive',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
];
