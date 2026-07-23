// Netlify Function: recibe el pedido desde el formulario del sitio y lo reenvía
// a tu flujo de n8n, que se encarga de avisarte por WhatsApp (Evolution API) y correo.
// También:
//   - marca como "usado" el código de descuento de bienvenida en Supabase (si aplicó)
//   - registra el pedido en la tabla `pedidos`
//   - actualiza el perfil del cliente (estado, lead score, última actividad)
//   - marca su carrito como "convertido"
//
// Variables de entorno necesarias (Netlify → Site configuration → Environment variables):
//   N8N_WEBHOOK_URL       → la URL del webhook que crees en n8n
//   N8N_WEBHOOK_SECRET    → una clave inventada por ti, para proteger el webhook
//   SUPABASE_URL          → la URL de tu proyecto Supabase (Settings → API → Project URL)
//   SUPABASE_SERVICE_KEY  → tu llave service_role (secreta)

function supabaseConfig() {
  const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };
  return { SUPABASE_URL, SERVICE_KEY, headers };
}

async function redeemDiscountCode(discountCode, orderNumber) {
  const { SUPABASE_URL, SERVICE_KEY, headers } = supabaseConfig();
  if (!discountCode || !SUPABASE_URL || !SERVICE_KEY) return;

  await fetch(
    `${SUPABASE_URL}/rest/v1/popup_contactos?codigo_descuento=eq.${encodeURIComponent(discountCode)}&usado=eq.false`,
    { method: 'PATCH', headers, body: JSON.stringify({ usado: true, fecha_uso: new Date().toISOString(), pedido_numero: orderNumber || null }) }
  );
}

/**
 * Crea o recupera el cliente por celular (para pedidos que llegan sin haber
 * pasado por el pop-up, ej. checkout directo), y devuelve su id.
 */
async function resolverClientePorPedido(nombre, celular) {
  const { SUPABASE_URL, SERVICE_KEY, headers } = supabaseConfig();
  if (!SUPABASE_URL || !SERVICE_KEY || !celular) return null;

  const celularLimpio = celular.replace(/\s+/g, '');
  const buscar = await fetch(`${SUPABASE_URL}/rest/v1/clientes?celular=eq.${encodeURIComponent(celularLimpio)}&select=id`, { headers });
  const encontrados = await buscar.json();

  if (Array.isArray(encontrados) && encontrados.length > 0) {
    return encontrados[0].id;
  }
  const crear = await fetch(`${SUPABASE_URL}/rest/v1/clientes`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify([{ nombre, celular: celularLimpio, ultimo_evento: 'purchase', estado: 'comprador', lead_score: 60 }]),
  });
  const creado = await crear.json();
  return creado[0] ? creado[0].id : null;
}

async function registrarPedidoYActualizarCliente(orderData) {
  const { SUPABASE_URL, SERVICE_KEY, headers } = supabaseConfig();
  if (!SUPABASE_URL || !SERVICE_KEY) return;

  const clienteId = await resolverClientePorPedido(orderData.nombre, orderData.celular);

  await fetch(`${SUPABASE_URL}/rest/v1/pedidos`, {
    method: 'POST',
    headers,
    body: JSON.stringify([{
      orden_numero: orderData.orderNumber,
      sesion_id: orderData.sesionId || null,
      cliente_id: clienteId,
      items: orderData.items,
      subtotal: orderData.subtotal,
      descuento: orderData.discountAmount || 0,
      total: orderData.total,
      metodo_pago: 'pendiente', // se define cuando elige transferencia/tarjeta en el paso siguiente
      estado: 'completado',
      cupon_codigo: orderData.discountCode || null,
    }]),
  });

  if (clienteId) {
    await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        estado: 'comprador',
        ultimo_evento: 'purchase',
        ultima_actividad: new Date().toISOString(),
        descuento_15_usado: !!orderData.discountCode,
      }),
    });

    if (orderData.sesionId) {
      await fetch(`${SUPABASE_URL}/rest/v1/carritos?sesion_id=eq.${orderData.sesionId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ estado: 'convertido' }),
      }).catch(() => {});
    }
  }
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
    // y registrar todo en Supabase para el CRM de recorrido del cliente.
    try {
      if (orderData.discountCode) {
        await redeemDiscountCode(orderData.discountCode, orderData.orderNumber);
      }
      await registrarPedidoYActualizarCliente(orderData);
    } catch (e) {
      // No bloqueamos la confirmación del pedido si el registro en Supabase falla
      console.error('No se pudo registrar el pedido en Supabase:', e.message);
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
