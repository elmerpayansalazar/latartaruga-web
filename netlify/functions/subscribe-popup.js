// Netlify Function: recibe nombre + celular del pop-up de bienvenida.
// Hace dos cosas:
//   1. Genera un código de descuento único y lo guarda en popup_contactos (como antes).
//   2. Resuelve la IDENTIDAD del cliente: crea/actualiza su fila en `clientes`,
//      y une TODO su historial de navegación anónima (visitante, sesiones,
//      eventos, carrito) a ese cliente - así aunque haya navegado 10 minutos
//      antes de identificarse, todo queda bajo un mismo perfil.
//
// Variables de entorno necesarias:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { nombre, celular, visitanteId } = JSON.parse(event.body);
    if (!nombre || !celular) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Falta nombre o celular' }) };
    }

    const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Supabase no está configurado en Netlify' }) };
    }

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };

    const celularLimpio = celular.replace(/\s+/g, '');

    // --- Paso 1: resolver identidad del cliente (crear o recuperar) ---
    const clienteId = await resolverCliente(SUPABASE_URL, headers, nombre, celularLimpio, visitanteId);

    // --- Paso 2: código de descuento (lógica que ya existía) ---
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/popup_contactos?celular=eq.${encodeURIComponent(celularLimpio)}&select=codigo_descuento,usado`,
      { headers }
    );
    const existing = await checkRes.json();

    if (Array.isArray(existing) && existing.length > 0) {
      const row = existing[0];
      if (row.usado) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ yaUsado: true, codigo: row.codigo_descuento, clienteId }),
        };
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: row.codigo_descuento, clienteId }),
      };
    }

    const codigo = 'BIENVENIDA15-' + Math.random().toString(36).slice(2, 6).toUpperCase();

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/popup_contactos`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify([{ nombre, celular: celularLimpio, codigo_descuento: codigo, cliente_id: clienteId }]),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      throw new Error(`Supabase insert falló: ${errText}`);
    }

    // Marca en el cliente que reclamó el descuento (para la alerta de "reclamó pero no usó")
    await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ descuento_15_reclamado: true }),
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, clienteId }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error generando el descuento', detail: err.message }),
    };
  }
};

/**
 * Crea o recupera el cliente por celular, y une el historial anónimo
 * (visitante + sus sesiones/carritos) a ese cliente.
 */
async function resolverCliente(SUPABASE_URL, headers, nombre, celular, visitanteId) {
  const buscar = await fetch(
    `${SUPABASE_URL}/rest/v1/clientes?celular=eq.${encodeURIComponent(celular)}&select=id`,
    { headers }
  );
  const encontrados = await buscar.json();

  let clienteId;
  if (Array.isArray(encontrados) && encontrados.length > 0) {
    clienteId = encontrados[0].id;
    await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        nombre,
        ultima_visita: new Date().toISOString(),
        ultima_actividad: new Date().toISOString(),
        ultimo_evento: 'popup_submitted',
        estado: 'recurrente',
      }),
    });
  } else {
    const crear = await fetch(`${SUPABASE_URL}/rest/v1/clientes`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify([{
        nombre,
        celular,
        ultimo_evento: 'popup_submitted',
        estado: 'nuevo',
        lead_score: 15, // dejar sus datos ya indica intención real
      }]),
    });
    const creado = await crear.json();
    clienteId = creado[0].id;
  }

  // Une el historial anónimo (visitante actual + sus sesiones/carritos) al cliente.
  // Los eventos ya quedan vinculados porque cada evento nuevo se envía con
  // cliente_id directamente desde el navegador una vez identificado (ver app.js).
  if (visitanteId) {
    await fetch(`${SUPABASE_URL}/rest/v1/visitantes?id=eq.${visitanteId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ cliente_id: clienteId }),
    });

    // Trae las sesiones de este visitante para poder enlazar sus carritos también
    const sesionesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/sesiones?visitante_id=eq.${visitanteId}&select=id`,
      { headers }
    );
    const sesionesDelVisitante = await sesionesRes.json();
    const sesionIds = Array.isArray(sesionesDelVisitante) ? sesionesDelVisitante.map(s => s.id) : [];

    await fetch(`${SUPABASE_URL}/rest/v1/sesiones?visitante_id=eq.${visitanteId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ cliente_id: clienteId }),
    });

    if (sesionIds.length > 0) {
      const filtroSesiones = `(${sesionIds.join(',')})`;
      await fetch(`${SUPABASE_URL}/rest/v1/carritos?sesion_id=in.${filtroSesiones}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ cliente_id: clienteId }),
      }).catch(() => {});
    }
  }

  return clienteId;
}
