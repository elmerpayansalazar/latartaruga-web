// Netlify Function: recibe el pedido desde el formulario del sitio y lo reenvía
// a tu flujo de n8n, que se encarga de avisarte por WhatsApp (Evolution API) y correo.
//
// Variables de entorno necesarias (Netlify → Site configuration → Environment variables):
//   N8N_WEBHOOK_URL    → la URL del webhook que crees en n8n (paso a paso más abajo)
//   N8N_WEBHOOK_SECRET → una clave inventada por ti, para que nadie más pueda
//                        activar tu webhook desde afuera

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const orderData = JSON.parse(event.body);

    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

    if (!webhookUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'N8N_WEBHOOK_URL no está configurada en Netlify' }),
      };
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': webhookSecret || '',
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      throw new Error(`n8n respondió con estado ${response.status}`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'No se pudo notificar el pedido', detail: err.message }),
    };
  }
};
