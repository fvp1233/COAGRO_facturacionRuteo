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
    id: 'dispositivo',
    title: 'Dispositivo',
    subtitle: 'Corporación',
    icon: 'cellphone-cog',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'manual',
    title: 'Manual de usuario',
    subtitle: 'Guía de uso',
    icon: 'book-open-variant',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
  {
    id: 'consultas',
    title: 'Consultas',
    subtitle: 'Dudas y soporte',
    icon: 'help-circle-outline',
    palette: { accent: colors.primary, tint: colors.surface, border: colors.border },
  },
];
