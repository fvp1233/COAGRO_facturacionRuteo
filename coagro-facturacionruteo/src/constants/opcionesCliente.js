import { colors } from '../theme';

// Opciones disponibles al validar un cliente (pantalla ClienteOpcionesView).
export const OPCIONES_CLIENTE = [
  {
    id: 'inventario',
    title: 'Inventario',
    icon: 'archive',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'cobros',
    title: 'Cobros',
    icon: 'cash',
    palette: { accent: colors.primary, iconColor: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'pedido',
    title: 'Pedido',
    icon: 'cart-plus',
    palette: { accent: colors.primary, iconColor: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'devolucion',
    title: 'Devolución',
    icon: 'clipboard-arrow-left',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'consignacion',
    title: 'Consignación',
    icon: 'handshake',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'anular',
    title: 'Menú Anular',
    icon: 'file-cancel',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'consultar',
    title: 'Menú Consultar',
    icon: 'file-search',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
];
