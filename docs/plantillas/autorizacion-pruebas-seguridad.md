# Autorización y alcance de pruebas de seguridad

> **Plantilla.** No es asesoría legal: haz que la revise un abogado colombiano antes de usarla.
> En Colombia, acceder a un sistema "sin autorización o por fuera de lo acordado" es delito (Ley 1273 de 2009,
> art. 269A: 48 a 96 meses de prisión). Los arts. 269B (obstaculización) y 269D (daño informático) aplican si una
> prueba tumba o daña un servicio. **Salirse del alcance firmado también es delito**, aunque exista contrato.
> El tratamiento de datos personales que se vean durante las pruebas se rige por la Ley 1581 de 2012.

Sin este documento firmado y vigente, el agente de seguridad no puede escanear nada: la herramienta `run_scan` del
motor rechaza cualquier objetivo que no esté en `clients/{id}/alcanceSeguridad` con fecha vigente.

---

## 1. Partes

| | Cliente (dueño de los sistemas) | Agencia (quien hace las pruebas) |
|---|---|---|
| Razón social | | |
| NIT | | |
| Representante | | |
| Cargo | | |
| Correo y teléfono | | |

El cliente declara que **es dueño o tiene autoridad legal sobre todos los activos** del alcance, o que adjunta la
autorización escrita de quien la tiene (proveedor de hosting, SaaS, desarrollador externo). Los servicios de terceros
(CDN, pasarelas de pago, correo, redes sociales, plataformas SaaS) **quedan fuera** salvo autorización escrita de ese
tercero o que sus políticas públicas lo permitan.

## 2. Alcance

| Tipo | Valor exacto | Notas |
|---|---|---|
| Dominio | `ejemplo.com` | Incluye / no incluye subdominios: ______ |
| Dominio | | |
| IP o rango | | |
| Repositorio de código | | Rama: |
| Aplicación (URL) | | Ambiente: producción / pruebas |

**Fuera de alcance** (no se toca bajo ninguna circunstancia):
- ______________________________________________
- Ataques de denegación de servicio, ingeniería social, acceso físico y pruebas contra personas.

## 3. Tipo de pruebas autorizadas

Marca solo lo autorizado:

- [ ] **Pasivas** (por defecto): revisión de encabezados de seguridad, configuración TLS/SSL, escaneo pasivo
      (OWASP ZAP baseline: navega y observa, no envía ataques), dependencias y código (SAST: semgrep, trivy,
      osv-scanner, gitleaks).
- [ ] **Activas** (solo con esta casilla, ventana y contacto de emergencia): escaneo de puertos (nmap), plantillas
      de vulnerabilidades (nuclei), escaneo activo (ZAP full scan). Límite de solicitudes: ____ por segundo.
- [ ] Pruebas autenticadas con cuentas de prueba entregadas por el cliente (nunca cuentas reales de usuarios).

Checklist de referencia: OWASP Top 10:2025.

## 4. Ventanas y vigencia

- Vigencia: desde ____/____/______ hasta ____/____/______ (máximo 90 días; para continuar se firma otro).
- Ventanas permitidas (hora de Colombia): ______________________
- Pausa inmediata: si el cliente lo pide por cualquier medio, las pruebas se detienen.

## 5. Contactos de emergencia

| Rol | Nombre | Teléfono | Disponible |
|---|---|---|---|
| Técnico del cliente | | | |
| Responsable de la agencia | | | |

Si una prueba afecta la disponibilidad, se detiene y se avisa de inmediato.

## 6. Confidencialidad y datos

- Los hallazgos y cualquier dato visto durante las pruebas son confidenciales y solo se entregan al cliente.
- No se descargan, copian ni conservan datos personales. Si aparecen, se reportan sin copiarlos y se borran los
  registros que los contengan (Ley 1581 de 2012).
- Los informes se guardan cifrados y se borran a los ____ meses.
- Las vulnerabilidades no se divulgan a terceros sin autorización escrita del cliente.

## 7. Entregables

Informe con: resumen ejecutivo, hallazgos priorizados (crítico/alto/medio/bajo), evidencia, recomendaciones y
lo que quedó fuera del alcance. Los informes de pruebas activas los firma una persona responsable de la agencia.

## 8. Limitación

Las pruebas son una revisión en un momento dado y no garantizan la ausencia de vulnerabilidades.

## 9. Firmas

| | Cliente | Agencia |
|---|---|---|
| Nombre | | |
| Firma | | |
| Fecha | | |

---

### Cómo se carga en la app

Un administrador abre la ficha del cliente y llena **Alcance de seguridad** (dominios, IPs, repositorios, ventanas,
vigencia, firmante y el enlace al PDF firmado). Solo los administradores pueden editarlo. El motor valida cada
escaneo contra ese alcance y la fecha de vigencia.
