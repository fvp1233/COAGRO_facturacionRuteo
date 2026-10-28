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
    title: 'Notas Créd.',
    icon: 'invoice',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'pedidos',
    title: 'Pedidos',
    icon: 'cart-plus',
    palette: { accent: colors.primary, iconColor: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'pedidos-estado',
    title: 'Ped. Estado',
    icon: 'autorenew',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'devolucion',
    title: 'Devolución',
    icon: 'clipboard-arrow-left',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'articulos',
    title: 'Artículos',
    icon: 'tag',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
];
