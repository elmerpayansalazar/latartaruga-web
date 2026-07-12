// Netlify Function: genera la firma de integridad de Bold de forma segura.
// La llave secreta NUNCA se expone al navegador - vive solo aquí, como variable
// de entorno en Netlify (Site configuration → Environment variables → BOLD_SECRET_KEY).

const crypto = require('crypto');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { orderId, amount, currency } = JSON.parse(event.body);

    if (!orderId || !amount || !currency) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan datos: orderId, amount o currency' }),
      };
    }

    const secretKey = process.env.BOLD_SECRET_KEY;
    if (!secretKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'BOLD_SECRET_KEY no está configurada en Netlify' }),
      };
    }

    // Fórmula oficial de Bold: SHA256(orderId + amount + currency + secretKey)
    const cadena = `${orderId}${amount}${currency}${secretKey}`;
    const signature = crypto.createHash('sha256').update(cadena).digest('hex');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error generando la firma', detail: err.message }),
    };
  }
};
