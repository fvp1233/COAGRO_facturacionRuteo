// Datos de ejemplo hasta conectar el backend.
export const CLIENTES = [
  { codigo: 'CLI-0012', nombre: 'Agropecuaria El Roble', rnc: '101-55421-1', direccion: 'Carretera Mella km 12, Santo Domingo Este' },
  { codigo: 'CLI-0042', nombre: 'Hacienda San José', rnc: '101-77894-3', direccion: 'Finca San José, Paraje Los Cacaos, Monte Plata' },
  { codigo: 'CLI-0085', nombre: 'Ganadería La Estrella', rnc: '101-99234-8', direccion: 'Sección La Estrella, Bayaguana, Monte Plata' },
  { codigo: 'CLI-0103', nombre: 'Rancho San Rafael', rnc: '102-33412-5', direccion: 'Camino Real s/n, Yamasá, Monte Plata' },
  { codigo: 'CLI-0120', nombre: 'Finca Santa María', rnc: '101-44190-2', direccion: 'Paraje Santa María, Sabana Grande de Boyá' },
  { codigo: 'CLI-0134', nombre: 'Lechería Los Pinos', rnc: '101-62087-4', direccion: 'Carretera Monte Plata–Bayaguana km 5' },
  { codigo: 'CLI-0151', nombre: 'Ganadera Don Pedro', rnc: '102-10458-9', direccion: 'Sección El Dean, Peralvillo, Monte Plata' },
  { codigo: 'CLI-0167', nombre: 'Agroindustrial Buena Vista', rnc: '101-87312-6', direccion: 'Paraje Buena Vista, Don Juan, Monte Plata' },
];

export const RUTAS = ['Ruta 01 - Norte', 'Ruta 02 - Sur', 'Ruta 03 - Este'];
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const DIAS_FILTRO = ['Todos', ...DIAS];
export const ESTADOS = ['Todos', 'Visitados', 'No visitados'];
