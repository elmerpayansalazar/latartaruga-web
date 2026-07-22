// Netlify Function: recibe nombre + celular del pop-up de bienvenida,
// genera un código de descuento único y lo guarda en Supabase (tabla popup_contactos).
//
// Variables de entorno necesarias (Netlify → Site configuration → Environment variables):
//   SUPABASE_URL          → https://uuiadjqlnuwxczxqxufs.supabase.co
//   SUPABASE_SERVICE_KEY  → tu llave service_role (secreta, nunca en el código)

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { nombre, celular } = JSON.parse(event.body);
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

    // 1. ¿Ya existe este celular? (evita duplicados / re-uso)
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
          body: JSON.stringify({ yaUsado: true, codigo: row.codigo_descuento }),
        };
      }
      // Ya tiene un código sin usar: se lo reenviamos, no creamos uno nuevo
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: row.codigo_descuento }),
      };
    }

    // 2. Generar código único y guardar el contacto nuevo
    const codigo = 'BIENVENIDA15-' + Math.random().toString(36).slice(2, 6).toUpperCase();

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/popup_contactos`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify([{ nombre, celular: celularLimpio, codigo_descuento: codigo }]),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      throw new Error(`Supabase insert falló: ${errText}`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error generando el descuento', detail: err.message }),
    };
  }
};
