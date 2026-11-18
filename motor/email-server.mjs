// Servidor MCP "agentes-email" (fase C2): Listmonk en modo BORRADOR. El motor le pasa, solo para la tarea de un
// cliente: AGENTES_LISTMONK_URL, AGENTES_LISTMONK_CRED (usuario_api:token) y AGENTES_LISTMONK_LISTAS (IDs del cliente).
// No hay herramienta de envío: las campañas quedan en borrador y una persona las envía desde Listmonk.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { crearListmonk, cuerpoBorrador, listasPermitidas } from './email.mjs'

const ok = (o) => ({ content: [{ type: 'text', text: typeof o === 'string' ? o : JSON.stringify(o, null, 1) }] })
const fail = (e) => ({ content: [{ type: 'text', text: `Error: ${e?.message || e}` }], isError: true })
const permitidas = () => listasPermitidas(process.env.AGENTES_LISTMONK_LISTAS)
function lm() {
  if (!process.env.AGENTES_LISTMONK_URL || !process.env.AGENTES_LISTMONK_CRED) throw new Error('Listmonk no está conectado (Agencia → Motor)')
  if (!permitidas().length) throw new Error('Este cliente no tiene listas de Listmonk asignadas (ficha del cliente → Email)')
  return crearListmonk({ url: process.env.AGENTES_LISTMONK_URL, credencial: process.env.AGENTES_LISTMONK_CRED })
}

const server = new McpServer({ name: 'agentes-email', version: '1.0.0' })

server.tool('email_listas', 'Listas de suscriptores de ESTE cliente en Listmonk (id, nombre, suscriptores).', {},
  async () => { try { const p = permitidas(); return ok((await lm().listas()).filter(l => p.includes(l.id))) } catch (e) { return fail(e) } })

server.tool('email_campanas', 'Campañas recientes en las listas de este cliente (estado: borrador, enviada…), para no repetir asuntos ni contenidos.', {},
  async () => {
    try {
      const listas = await lm().listas(); const p = permitidas()
      const nombres = new Set(listas.filter(l => p.includes(l.id)).map(l => l.nombre))
      return ok((await lm().campanas()).filter(c => c.listas.some(n => nombres.has(n))))
    } catch (e) { return fail(e) }
  })

server.tool('email_crear_borrador',
  'Crea una campaña en BORRADOR en Listmonk (no se envía). El dueño la revisa y la envía desde Listmonk. Usa HTML simple con estilos en línea, ancho máximo 600 px, y el enlace de baja {{ UnsubscribeURL }}.',
  { nombre: z.string().min(1).max(200), asunto: z.string().min(1).max(200), listas: z.array(z.number().int()).min(1), html: z.string().min(20) },
  async ({ nombre, asunto, listas, html }) => {
    try {
      const c = await lm().crearBorrador(cuerpoBorrador({ nombre, asunto, listas, html, permitidas: permitidas() }))
      return ok({ ...c, aviso: 'Quedó en BORRADOR. No se envió nada.' })
    } catch (e) { return fail(e) }
  })

await server.connect(new StdioServerTransport())
