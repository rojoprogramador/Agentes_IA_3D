// Agencia: departamentos, fichas de clientes y tipos de tarea (colecciones departments, clients, taskTypes)

// Departamentos con los que arranca la agencia (se pueden editar en Agencia → Departamentos)
export const DEFAULT_DEPARTMENTS = [
  { id: 'marketing',   nombre: 'Marketing y Contenido', descripcion: 'Copies, video, imágenes, SEO y estrategia.', color: '#db2777', orden: 0 },
  { id: 'desarrollo',  nombre: 'Desarrollo',            descripcion: 'Webs, automatizaciones y software.',         color: '#2563eb', orden: 1 },
  { id: 'seguridad',   nombre: 'Seguridad',             descripcion: 'Auditorías dentro del alcance autorizado.',  color: '#dc2626', orden: 2 },
  { id: 'operaciones', nombre: 'Operaciones',           descripcion: 'Coordinación, investigación y métricas.',    color: '#059669', orden: 3 },
]

// Tipos de tarea de ejemplo (Agencia → Tipos de tarea → "Cargar ejemplos")
export const EXAMPLE_TASK_TYPES = [
  {
    id: 'brochure_pdf', departamento: 'marketing', rol: 'diseno_grafico', nombre: 'Brochure o portafolio (PDF)',
    descripcion: 'Pieza en PDF (brochure, portafolio de servicios, propuesta o flyer) con vista previa para aprobar.',
    plantillaBrief: [
      { campo: 'pieza', etiqueta: 'Qué pieza (brochure, portafolio, propuesta, flyer)', tipo: 'texto', requerido: true },
      { campo: 'paginas', etiqueta: 'Cuántas páginas', tipo: 'numero', requerido: false },
      { campo: 'contenido', etiqueta: 'Contenido o de dónde sacarlo (web, documento)', tipo: 'texto', requerido: true },
    ],
    checklist: ['Usa la identidad del cliente (colores, logo, tono)', 'Cada página cabe en A4 sin cortes', 'No inventa precios, cifras ni testimonios', 'Datos de contacto completos y correctos'],
    revisor: 'revisor_calidad', formatoEntrega: 'archivos', herramientas: ['salida'],
  },
  {
    id: 'ideas_posts', departamento: 'marketing', rol: 'copies_redes', nombre: 'Ideas de posts',
    descripcion: 'Ideas de publicaciones para redes con gancho y llamado a la acción.',
    plantillaBrief: [
      { campo: 'cantidad', etiqueta: 'Cuántas ideas', tipo: 'numero', requerido: true },
      { campo: 'redes', etiqueta: 'Redes (Instagram, TikTok…)', tipo: 'texto', requerido: false },
    ],
    checklist: ['Respeta el tono y las palabras prohibidas del cliente', 'Cada idea tiene gancho y llamado a la acción', 'No inventa precios, cifras ni testimonios'],
    revisor: 'revisor_calidad', formatoEntrega: 'texto',
  },
  {
    id: 'copy_redes', departamento: 'marketing', rol: 'copies_redes', nombre: 'Copy para redes',
    descripcion: 'Caption o carrusel listo para publicar.',
    plantillaBrief: [
      { campo: 'formato', etiqueta: 'Formato (caption, carrusel, guion de reel)', tipo: 'texto', requerido: true },
      { campo: 'tema', etiqueta: 'Tema o producto', tipo: 'texto', requerido: true },
    ],
    checklist: ['Respeta el tono del cliente', 'Incluye 3 opciones de gancho', 'Llamado a la acción claro'],
    revisor: 'revisor_calidad', formatoEntrega: 'texto',
  },
  {
    id: 'articulo_blog', departamento: 'marketing', rol: 'textos_seo', nombre: 'Artículo de blog',
    descripcion: 'Artículo optimizado para una palabra clave.',
    plantillaBrief: [
      { campo: 'palabraClave', etiqueta: 'Palabra clave principal', tipo: 'texto', requerido: true },
      { campo: 'extension', etiqueta: 'Extensión aproximada (palabras)', tipo: 'numero', requerido: false },
    ],
    checklist: ['Título de máximo 60 caracteres', 'Meta descripción de máximo 160 caracteres', 'Un solo H1 y jerarquía de encabezados correcta', 'No inventa datos'],
    revisor: 'revisor_calidad', formatoEntrega: 'texto',
  },
  {
    id: 'investigacion', departamento: 'operaciones', rol: 'investigacion', nombre: 'Informe de investigación',
    descripcion: 'Investigación con fuentes sobre un tema, mercado o competencia.',
    plantillaBrief: [
      { campo: 'pregunta', etiqueta: 'Pregunta a responder', tipo: 'texto_largo', requerido: true },
    ],
    checklist: ['Cada dato importante tiene su fuente', 'Termina con conclusiones accionables'],
    revisor: null, formatoEntrega: 'reporte',
  },
  {
    id: 'edicion_video', departamento: 'marketing', rol: 'editor_video', nombre: 'Edición de video',
    descripcion: 'Limpieza de un video: silencios, tomas falsas y audio.',
    plantillaBrief: [
      { campo: 'video', etiqueta: 'Video de entrada (nombre en la carpeta Entrada o ruta en Drive)', tipo: 'texto', requerido: true },
      { campo: 'extras', etiqueta: 'Extras (subtítulos, formato vertical…)', tipo: 'texto', requerido: false },
    ],
    checklist: ['El MP4 final existe y se reproduce', 'No quedan silencios largos ni tomas falsas'],
    revisor: null, formatoEntrega: 'video',
  },
  {
    id: 'auditoria_seo', departamento: 'marketing', rol: 'seo_tecnico', nombre: 'Auditoría SEO técnica (PDF)',
    descripcion: 'Velocidad, indexación, sitemap, datos estructurados y SEO on-page medidos, con plan de acción.',
    plantillaBrief: [
      { campo: 'url', etiqueta: 'Sitio a auditar (URL)', tipo: 'texto', requerido: true },
      { campo: 'paginasClave', etiqueta: 'Páginas clave (servicios, landing)', tipo: 'texto_largo', requerido: false },
      { campo: 'objetivo', etiqueta: 'Objetivo (más llamadas, posicionar un servicio…)', tipo: 'texto', requerido: false },
    ],
    checklist: ['Cada hallazgo trae su evidencia medida y la herramienta', 'No hay cifras inventadas: lo que falló se dice', 'Hallazgos priorizados con quién los arregla', 'Resumen entendible para el dueño del negocio'],
    revisor: 'revisor_calidad', formatoEntrega: 'archivos', herramientas: ['auditoria', 'salida'],
  },
  {
    id: 'qa_sitio', departamento: 'desarrollo', rol: 'qa', nombre: 'QA de sitio o landing (PDF)',
    descripcion: 'Enlaces rotos, errores, accesibilidad y vista en móvil y escritorio antes de publicar.',
    plantillaBrief: [
      { campo: 'url', etiqueta: 'URL a probar', tipo: 'texto', requerido: true },
      { campo: 'cambios', etiqueta: 'Qué cambió o qué revisar en especial', tipo: 'texto_largo', requerido: false },
    ],
    checklist: ['Cada fallo dice página, qué pasa, evidencia y prioridad', 'Incluye capturas de móvil y escritorio', 'Lista lo que hay que revisar a mano en accesibilidad'],
    revisor: null, formatoEntrega: 'archivos', herramientas: ['auditoria', 'salida'],
  },
  {
    id: 'analisis_repo', departamento: 'seguridad', rol: 'auditor_seguridad', nombre: 'Análisis de seguridad de un repositorio (PDF)',
    descripcion: 'Secretos filtrados, dependencias vulnerables y análisis estático del código, sin tocar producción.',
    plantillaBrief: [
      { campo: 'repo', etiqueta: 'Repositorio (debe estar en el alcance del cliente)', tipo: 'texto', requerido: true },
      { campo: 'contexto', etiqueta: 'Qué es la aplicación y qué datos maneja', tipo: 'texto_largo', requerido: false },
    ],
    checklist: ['Solo se escaneó lo autorizado y vigente', 'Ningún secreto aparece copiado en el informe', 'Cada hallazgo trae herramienta, referencia y cómo arreglarlo', 'Incluye el checklist OWASP Top 10:2025 y los límites de la prueba'],
    revisor: null, formatoEntrega: 'archivos', herramientas: ['seguridad', 'salida'],
  },
  {
    id: 'informe_analitica', departamento: 'operaciones', rol: 'analista', nombre: 'Informe mensual de analítica (PDF)',
    descripcion: 'Tráfico, conversiones y Google del mes pasado comparado con el anterior, con oportunidades y acciones. Prográmalo el día 3 de cada mes.',
    plantillaBrief: [
      { campo: 'enfoque', etiqueta: 'En qué fijarse (un servicio, una campaña, una página)', tipo: 'texto', requerido: false },
    ],
    checklist: ['Todas las cifras vienen de GA4 o Search Console con su periodo', 'Compara con el periodo anterior', 'Termina con 3 a 5 acciones concretas', 'Explica sin jerga'],
    revisor: 'revisor_calidad', formatoEntrega: 'archivos', herramientas: ['analitica', 'salida'],
  },
  {
    id: 'auditoria_ads', departamento: 'marketing', rol: 'paid_media', nombre: 'Auditoría de anuncios (PDF)',
    descripcion: 'Google Ads y Meta Ads: gasto, resultados, desperdicio y propuestas. No cambia nada en las cuentas.',
    plantillaBrief: [
      { campo: 'objetivo', etiqueta: 'Objetivo (más llamadas, leads, ventas)', tipo: 'texto', requerido: false },
      { campo: 'periodo', etiqueta: 'Periodo (por defecto, últimos 28 días)', tipo: 'texto', requerido: false },
    ],
    checklist: ['Todas las cifras vienen de las cuentas con su periodo', 'Cada propuesta trae evidencia y efecto esperado', 'Dice si el gasto va a pasar del tope', 'Aclara que no se cambió nada'],
    revisor: 'revisor_calidad', formatoEntrega: 'archivos', herramientas: ['ads', 'salida'],
  },
]

export const FIELD_TYPES = [
  { id: 'texto', label: 'Texto corto' },
  { id: 'texto_largo', label: 'Texto largo' },
  { id: 'numero', label: 'Número' },
  { id: 'url', label: 'Link' },
]

export const DELIVERY_FORMATS = [
  { id: 'texto', label: 'Texto' },
  { id: 'archivos', label: 'Archivos' },
  { id: 'video', label: 'Video' },
  { id: 'reporte', label: 'Reporte' },
  { id: 'pr', label: 'Pull request' },
]

// Ficha vacía de un cliente
export const emptyClient = (nombre = '') => ({
  nombre, slug: slugify(nombre), activo: true, interno: false, orden: 0,
  negocio: { descripcion: '', servicios: [], zona: '', publico: '' },
  marca: { tono: '', colores: [], logoUrl: '', palabrasSi: [], palabrasNo: [] },
  objetivos: [],
  activos: { web: '', redes: '', repos: [], driveFolderId: '', bibliotecaPath: '' },
  analitica: { ga4PropertyId: '', gscSitio: '' },
  ads: { googleAdsCustomerId: '', metaAdAccountId: '', topeMensual: 0 },
  alcanceAutorizado: { dominios: [], repos: [], ips: [], subdominios: false, notas: '', autorizadoPor: '', cargo: '', fecha: '', documento: '', vigenciaDesde: '', vigenciaHasta: '', ventana: { dias: [], desde: '', hasta: '' } },
  departamentos: [],
  aprendizajes: [],
})

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

// Listas editadas como "una por línea"
export const toLines = (arr) => (arr || []).join('\n')
export const fromLines = (s) => String(s || '').split('\n').map(x => x.trim()).filter(Boolean)

// Proveedores de modelos con API compatible con OpenAI. Los nombres de modelos cambian seguido:
// son sugerencias; "Probar conexión" trae la lista real desde el proveedor.
export const PROVIDER_PRESETS = [
  { id: 'gemini', nombre: 'Google Gemini', gratis: true, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', modelos: ['gemini-2.5-flash', 'gemini-2.5-pro'], ayuda: 'Clave gratis en aistudio.google.com. El plan gratis puede usar tus datos para mejorar sus productos.' },
  { id: 'groq', nombre: 'Groq', gratis: true, baseUrl: 'https://api.groq.com/openai/v1', modelos: ['llama-3.3-70b-versatile'], ayuda: 'Clave en console.groq.com. Muy rápido, con plan gratis limitado.' },
  { id: 'cerebras', nombre: 'Cerebras', gratis: true, baseUrl: 'https://api.cerebras.ai/v1', modelos: [], ayuda: 'Clave gratis en cloud.cerebras.ai. Usa "Probar conexión" para ver los modelos.' },
  { id: 'deepseek', nombre: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', modelos: ['deepseek-chat', 'deepseek-reasoner'], ayuda: 'Clave en platform.deepseek.com. De pago, muy barato.' },
  { id: 'xai', nombre: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', modelos: [], ayuda: 'Clave en console.x.ai. Usa "Probar conexión" para ver los modelos.' },
  { id: 'openrouter', nombre: 'OpenRouter', gratis: true, baseUrl: 'https://openrouter.ai/api/v1', modelos: [], ayuda: 'Una clave para muchos modelos; los que terminan en ":free" son gratis. Límites actuales de cada proveedor gratis: github.com/cheahjs/free-llm-api-resources' },
  { id: 'ollama', nombre: 'Ollama (en tu PC)', baseUrl: 'http://localhost:11434/v1', modelos: [], ayuda: 'Modelos locales: no sale nada de tu PC. No necesita clave.' },
]

// Tareas para un departamento completo: quedan sin asignado (asignado = '') con paraDepartamento = true
// hasta que una persona del departamento la toma o el motor se la da a uno de sus agentes.
export const DEPT_PREFIX = 'dept:'
export const esDeDepartamento = (t) => !!t?.paraDepartamento && !t?.asignado
export const deptDeAgente = (a, catalogo) => a?.departamentoId || catalogo?.roles?.[a?.rol]?.departamento || ''

// Grupos de permisos del catálogo (roles/catalogo.json → herramientas) con un nombre que se entienda.
// "sensible": da acceso a datos personales del dueño; se marca en rojo.
export const PERMISOS = [
  { id: 'salida', label: 'Crear archivos y PDF', ayuda: 'Escribe solo en la carpeta salida/ de la tarea; el motor convierte el HTML en PDF con vista previa' },
  { id: 'web', label: 'Buscar y leer páginas web' },
  { id: 'archivos', label: 'Leer adjuntos de la tarea' },
  { id: 'skills', label: 'Usar skills' },
  { id: 'drive_lectura', label: 'Leer Google Drive' },
  { id: 'drive_crear', label: 'Crear documentos en Google Drive' },
  { id: 'entregas', label: 'Guardar imágenes y archivos (servidor de medios)' },
  { id: 'editor_video', label: 'Editar video (servidor de medios)' },
  { id: 'magnific_imagenes', label: 'Generar imágenes con Magnific (de pago)' },
  { id: 'auditoria', label: 'Auditar sitios web (PageSpeed, rastreo, accesibilidad, schema)', ayuda: 'Solo sitios públicos; no modifica nada' },
  { id: 'ads', label: 'Leer Google Ads y Meta Ads del cliente', ayuda: 'Solo lectura: audita y propone, no cambia campañas' },
  { id: 'analitica', label: 'Leer GA4 y Search Console del cliente', ayuda: 'Solo lectura y solo del cliente de la tarea' },
  { id: 'seguridad', label: 'Escaneos de seguridad pasivos (Docker)', ayuda: 'Solo dentro del alcance firmado del cliente; cada escaneo pide tu aprobación' },
  { id: 'gmail', label: 'Leer tu Gmail y crear borradores', sensible: true },
  { id: 'calendario', label: 'Ver y crear eventos en tu calendario', sensible: true },
]
