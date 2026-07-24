// Netlify Function: guarda el estado actual del carrito en Supabase.
// Reemplaza la escritura directa desde el navegador (que estaba fallando por un
// problema con la llave "anon" nueva de Supabase) - usa la llave service_role.
//
// Variables de entorno necesarias (ya deberías tenerlas configuradas):
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { sesionId, clienteId, items, valorTotal, cantidadProductos } = JSON.parse(event.body);
    if (!sesionId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Falta sesionId' }) };
    }

    const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Supabase no está configurado' }) };
    }

    await fetch(`${SUPABASE_URL}/rest/v1/carritos`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{
        sesion_id: sesionId,
        cliente_id: clienteId || null,
        items: items || [],
        valor_total: valorTotal || 0,
        cantidad_productos: cantidadProductos || 0,
        estado: 'activo',
        ultima_modificacion: new Date().toISOString(),
      }]),
    });

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
