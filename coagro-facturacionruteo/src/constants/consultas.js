import { colors } from '../theme';

// Opciones de consulta: pestaña inferior Consulta del módulo Clientes y Menú Consultar del cliente.
export const CONSULTAS = [
  {
    id: 'cliente',
    title: 'Cliente',
    icon: 'card-account-details',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
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
    id: 'documentos',
    title: 'Documentos',
    icon: 'receipt-text',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'notas-credito',
    title: 'Notas de crédito',
    icon: 'invoice',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'pedidos',
    title: 'Pedidos',
    icon: 'cart-plus',
    palette: { accent: colors.primary, iconColor: colors.primary, tint: colors.surface, border: colors.border },
  },
];

// Pestaña inferior Consulta: Pedidos muestra los pedidos y las cotizaciones del cliente en el equipo.
export const CONSULTAS_TAB = CONSULTAS.map((c) => (c.id === 'pedidos' ? { ...c, title: 'Pedidos y cotizaciones' } : c));