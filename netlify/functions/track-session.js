// Netlify Function: crea/actualiza el registro de sesión y visitante en Supabase.
// Se llama UNA vez por sesión (no por cada evento), por eso pasa por una función:
// aquí sí podemos leer la ciudad/país del visitante (Netlify nos la da gratis en
// el contexto de la petición), algo que el navegador no puede saber por sí solo.
//
// Variables de entorno necesarias (ya deberías tener SUPABASE_URL y
// SUPABASE_SERVICE_KEY configuradas de los pasos anteriores):
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { visitanteId, sesionId, utm, referrer, dispositivo, navegador, sistemaOperativo } = JSON.parse(event.body);

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

    // Netlify entrega la geolocalización aproximada del visitante sin costo extra
    const geo = context.geo || {};
    const ciudad = geo.city || null;
    const pais = geo.country ? geo.country.name : null;

    // 1. Upsert del visitante (crea si no existe, actualiza última visita si ya existía)
    await fetch(`${SUPABASE_URL}/rest/v1/visitantes`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ id: visitanteId, ultima_visita: new Date().toISOString() }]),
    });

    // 2. Crear la sesión
    await fetch(`${SUPABASE_URL}/rest/v1/sesiones`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{
        id: sesionId,
        visitante_id: visitanteId,
        utm_source: utm?.utm_source || null,
        utm_medium: utm?.utm_medium || null,
        utm_campaign: utm?.utm_campaign || null,
        utm_content: utm?.utm_content || null,
        utm_term: utm?.utm_term || null,
        referrer: referrer || null,
        dispositivo: dispositivo || null,
        navegador: navegador || null,
        sistema_operativo: sistemaOperativo || null,
        ciudad,
        pais,
      }]),
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    // Nunca bloqueamos la navegación del usuario por un fallo de tracking
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
