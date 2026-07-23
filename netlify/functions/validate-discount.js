// Netlify Function: valida un código de descuento ingresado manualmente en el carrito
// (para cuando el cliente cerró el navegador y volvió después, o lo recibió de otra forma).
// Solo confirma si es válido y no ha sido usado - la marca de "usado" real sigue
// pasando en submit-order.js, al momento de confirmar la compra.
//
// Variables de entorno necesarias:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { codigo } = JSON.parse(event.body);
    if (!codigo) {
      return { statusCode: 400, body: JSON.stringify({ valid: false, error: 'Falta el código' }) };
    }

    const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return { statusCode: 500, body: JSON.stringify({ valid: false, error: 'Supabase no está configurado' }) };
    }

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    };

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/popup_contactos?codigo_descuento=eq.${encodeURIComponent(codigo)}&select=usado`,
      { headers }
    );
    const rows = await res.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid: false, error: 'Ese código no existe.' }),
      };
    }
    if (rows[0].usado) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid: false, error: 'Ese código ya fue utilizado.' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valid: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ valid: false, error: 'Error validando el código', detail: err.message }),
    };
  }
};
