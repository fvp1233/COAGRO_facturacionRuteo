import { colors } from '../theme';

// Opciones del módulo Parámetros (pantalla ParametrosScreen).
export const PARAMETROS = [
  {
    id: 'sistema',
    title: 'Sistema',
    subtitle: 'Parámetros generales',
    icon: 'cog-outline',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'consulta-ncf',
    title: 'NCF / eCF',
    subtitle: 'Consulta',
    icon: 'file-search-outline',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'dispositivo',
    title: 'Dispositivo',
    subtitle: 'Corporación',
    icon: 'cellphone-cog',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'impresion',
    title: 'Impresión',
    subtitle: 'Parámetros de impresora',
    icon: 'printer-settings',
    palette: { accent: colors.primary, iconColor: colors.primary, tint: colors.surface, border: colors.border },
  },
];
