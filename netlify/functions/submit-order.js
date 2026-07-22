// Netlify Function: recibe el pedido desde el formulario del sitio y lo reenvía
// a tu flujo de n8n, que se encarga de avisarte por WhatsApp (Evolution API) y correo.
// También marca como "usado" el código de descuento de bienvenida en Supabase,
// si el pedido incluyó uno - así queda protegido contra reuso.
//
// Variables de entorno necesarias (Netlify → Site configuration → Environment variables):
//   N8N_WEBHOOK_URL       → la URL del webhook que crees en n8n
//   N8N_WEBHOOK_SECRET    → una clave inventada por ti, para proteger el webhook
//   SUPABASE_URL          → https://uuiadjqlnuwxczxqxufs.supabase.co
//   SUPABASE_SERVICE_KEY  → tu llave service_role (secreta)

async function redeemDiscountCode(discountCode, orderNumber) {
  const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!discountCode || !SUPABASE_URL || !SERVICE_KEY) return;

  await fetch(
    `${SUPABASE_URL}/rest/v1/popup_contactos?codigo_descuento=eq.${encodeURIComponent(discountCode)}&usado=eq.false`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usado: true,
        fecha_uso: new Date().toISOString(),
        pedido_numero: orderNumber || null,
      }),
    }
  );
}

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

    // El pedido ya se confirmó y notificó - ahora sí es seguro marcar el código como usado
    if (orderData.discountCode) {
      try {
        await redeemDiscountCode(orderData.discountCode, orderData.orderNumber);
      } catch (e) {
        // No bloqueamos el pedido si esto falla, solo se registra
        console.error('No se pudo marcar el código de descuento como usado:', e.message);
      }
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
