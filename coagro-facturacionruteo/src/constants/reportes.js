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
    subtitle: 'Efectividad',
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
  {
    id: 'liquidacion-inventario',
    title: 'Liquidación',
    subtitle: 'Inventario',
    icon: 'clipboard-list',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'devolucion',
    title: 'Devolución',
    subtitle: 'Mermas',
    icon: 'clipboard-arrow-left',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'liquidacion-jornada',
    title: 'Liquidación',
    subtitle: 'Jornada',
    icon: 'calendar-check',
    palette: { accent: colors.primary, iconColor: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'cierre-caja',
    title: 'Cierre Caja',
    subtitle: 'Cuadre final',
    icon: 'cash-register',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
];
