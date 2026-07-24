// Netlify Function: registra un evento de tracking en Supabase.
// Reemplaza la escritura directa desde el navegador (que estaba fallando por un
// problema con la llave "anon" nueva de Supabase) - usa la llave service_role,
// igual que ya hacen submit-order.js y subscribe-popup.js, que sí funcionan bien.
//
// Variables de entorno necesarias (ya deberías tenerlas configuradas):
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { sesionId, clienteId, tipo, datos } = JSON.parse(event.body);
    if (!sesionId || !tipo) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Falta sesionId o tipo' }) };
    }

    const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Supabase no está configurado' }) };
    }

    await fetch(`${SUPABASE_URL}/rest/v1/eventos`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        sesion_id: sesionId,
        cliente_id: clienteId || null,
        tipo,
        datos: datos || {},
      }]),
    });

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    // El tracking nunca debe romper la experiencia del cliente
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
