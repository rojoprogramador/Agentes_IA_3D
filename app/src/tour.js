// Tour guiado (fase D). Cada pantalla tiene sus pasos: `sel` es el elemento que se ilumina (si no está visible, el
// paso se muestra al centro), `admin: true` lo ven solo los administradores. El tour completo recorre las pantallas en
// orden cambiando de página. Para agregar un paso: pon data-tour="algo" en el elemento y un paso con sel '[data-tour="algo"]'.

export const TOURS = {
  dashboard: [
    { titulo: 'Tu panel', texto: 'Aquí ves de un vistazo tus tareas por estado, quién está trabajando ahora y tus números del mes. Es la página de inicio de cada persona del equipo.' },
    { sel: '[data-tour="nueva-tarea"]', titulo: 'Crear una tarea', texto: 'Desde cualquier pantalla. Puedes asignarla a una persona o a un agente de IA, elegir el cliente y el tipo de tarea (con su brief y su checklist).' },
    { sel: '[data-tour="notificaciones"]', titulo: 'Notificaciones', texto: 'Te avisa cuando un agente termina, necesita información o una tarea cambia. Lo urgente también te llega por Telegram o WhatsApp.' },
    { sel: '[data-tour="ayuda"]', titulo: 'Esta guía', texto: 'Este botón explica la pantalla en la que estés. Úsalo cuando quieras.' },
  ],
  office: [
    { titulo: 'La Oficina', texto: 'Tu equipo en 3D: personas y agentes de IA en sus escritorios. El color indica si están trabajando, en pausa, disponibles o desconectados.' },
    { sel: '.office-panel', titulo: 'Quién hace qué', texto: 'Lista del equipo con su estado y la tarea en curso. Haz clic en alguien para ver su detalle o chatear con un agente.' },
    { sel: '[data-tour="chat-agentes"]', titulo: 'Chat de agentes', texto: 'Habla con todo el equipo de agentes. Menciona a uno con @Nombre; si no mencionas a nadie, responde el coordinador. Los agentes pueden pasarse la palabra.', admin: true },
    { sel: '[data-tour="salas"]', titulo: 'Salas de clientes', texto: 'Un chat por cliente con solo los agentes que lo atienden y su historial. Responde el agente líder o a quien él le pase la palabra. Se activa en la ficha del cliente.', admin: true },
  ],
  pipeline: [
    { titulo: 'El Pipeline', texto: 'El tablero de producción: cada tarea avanza de Pendiente a En progreso, Espera aprobación y Completada. Arrastra las tarjetas para moverlas.' },
    { sel: '[data-tour="aprendizaje"]', titulo: 'Aprendizaje propuesto', texto: 'Cuando apruebas una tarea que costó correcciones, un modelo propone qué guardar en la memoria del cliente o del agente, una skill nueva o una mejora a las instrucciones de un rol. Nada se aplica sin que tú lo apruebes.', admin: true },
    { sel: '.kanban-board', titulo: 'Las columnas', texto: 'Cuando un agente toma una tarea pasa a En progreso; al terminar queda en Espera aprobación. Abre la tarjeta para ver la entrega (con vista previa del PDF si es un documento) y aprobarla, pedir corrección o rechazarla.' },
    { titulo: 'Detener y subtareas', texto: 'Dentro de la tarea puedes Detener a un agente en cualquier momento. Si el coordinador reparte una tarea grande, verás subtareas en paralelo; cuando todas entregan, él las consolida en una sola.' },
  ],
  tasks: [
    { titulo: 'Lista de tareas', texto: 'Todas las tareas en tabla: filtra por persona, agente, estado, cliente o mes, cambia el estado desde aquí y exporta a CSV.' },
  ],
  team: [
    { titulo: 'El equipo', texto: 'Qué tiene cada persona: su tarea activa, pendientes y completadas. Los administradores ven además el tiempo trabajado.' },
  ],
  agents: [
    { titulo: 'Agentes de IA', texto: 'Cada agente tiene un rol (copies, diseño, video, SEO técnico, analítica, paid media, seguridad…), su motor de IA (Claude, Antigravity, Codex, Gemini o un modelo por API), sus skills y su memoria.', admin: true },
    { titulo: 'Memoria y clientes permitidos', texto: 'La memoria del agente tiene un límite para que no se llene de ruido. Puedes limitar a qué clientes atiende cada agente: nunca ve datos de otros clientes.', admin: true },
  ],
  clients: [
    { titulo: 'Clientes', texto: 'La ficha de cada cliente es lo que leen los agentes en sus tareas: negocio, marca, objetivos y activos. Ningún agente ve la ficha de otro cliente.', admin: true },
    { titulo: 'Pestañas de la ficha', texto: 'Analítica y anuncios (GA4, Search Console, Google Ads, Meta y tope de gasto), Email (listas de Listmonk), GEO (si las IA recomiendan a la marca), Alcance (autorización firmada para pruebas de seguridad) y Aprendizajes (su memoria).', admin: true },
  ],
  agencia: [
    { titulo: 'Agencia', texto: 'La configuración del negocio: tipos de tarea, rutinas, departamentos, modelos de IA, skills, WhatsApp y el motor.', admin: true },
    { sel: '[data-tour="agencia-tareas"]', titulo: 'Tareas y tipos de tarea', texto: 'Cada tipo de tarea define su brief, su checklist, el agente que la hace, quién la revisa y qué herramientas recibe (por ejemplo "Auditoría SEO técnica" o "Informe mensual de analítica").', admin: true },
    { sel: '[data-tour="agencia-programadas"]', titulo: 'Rutinas programadas', texto: 'Tareas que se crean solas: diarias, semanales o mensuales (por ejemplo el informe de analítica el día 3 de cada mes). En una rutina, las acciones con efecto externo se deniegan porque nadie está mirando.', admin: true },
    { sel: '[data-tour="agencia-modelos"]', titulo: 'Modelos de IA', texto: 'Proveedores por API (Gemini, Groq, DeepSeek, OpenRouter…). Con ellos los agentes pueden leer webs y adjuntos y escribir en salida/ sin gastar Claude. Los gratis solo atienden a clientes que lo permitan.', admin: true },
    { sel: '[data-tour="agencia-skills"]', titulo: 'Skills', texto: 'Busca skills en skills.sh o GitHub; el motor las revisa en cuarentena sin ejecutar nada y solo las instala si lo apruebas. El curador cuenta cuánto se usa cada una y archiva (sin borrar) las que nadie usa.', admin: true },
    { sel: '[data-tour="agencia-whatsapp"]', titulo: 'WhatsApp', texto: 'Los números nuevos piden acceso con un código. Tú decides si son el dueño (habla con el coordinador) o un cliente (su mensaje va a esta bandeja y respondes tú).', admin: true },
    { sel: '[data-tour="agencia-motor"]', titulo: 'Motor', texto: 'El programa que corre los agentes en tu PC: claves, consumo de Claude, cuántas tareas en paralelo, aprendizaje, acciones con aprobación, alertas de caída, email y WhatsApp.', admin: true },
    { titulo: 'Acciones que piden tu aprobación', texto: 'Si un agente quiere crear un borrador de Gmail, un evento, un archivo fuera de su carpeta, gastar créditos o correr un escaneo de seguridad, te aparece arriba un aviso (y en Telegram) para aprobar una vez, para toda la tarea, siempre o denegar. Sin respuesta en 5 minutos, se deniega.', admin: true },
  ],
}

// Recorrido completo (primer ingreso o desde el botón de ayuda): una presentación y las pantallas en orden
export const ORDEN_COMPLETO = ['dashboard', 'office', 'pipeline', 'tasks', 'team', 'agents', 'clients', 'agencia']
export const INTRO = { titulo: 'Bienvenido a tu agencia con agentes de IA', texto: 'Personas y agentes de IA trabajan en el mismo tablero. Los agentes preparan entregables; tú apruebas: nada se publica ni se envía sin una persona. En 2 minutos te mostramos cada pantalla.' }

export function pasosDe(modo, pagina, esAdmin) {
  const filtrar = (l) => l.filter(p => esAdmin || !p.admin)
  if (modo === 'pagina') return filtrar(TOURS[pagina] || [{ titulo: 'Esta pantalla', texto: 'Todavía no tiene guía.' }]).map(p => ({ ...p, pagina }))
  return [{ ...INTRO, pagina: 'dashboard' }, ...ORDEN_COMPLETO.flatMap(pg => filtrar(TOURS[pg] || []).map(p => ({ ...p, pagina: pg })))]
}
