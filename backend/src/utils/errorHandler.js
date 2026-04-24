/**
 * errorHandler.js — [V2-002]
 * Función centralizada de manejo de errores en controllers.
 * - Producción: mensaje genérico, log completo por consola
 * - Desarrollo: message + stack completo
 */

const isDev = process.env.NODE_ENV !== 'production';

/**
 * @param {import('express').Response} res
 * @param {Error} error
 * @param {number} [status=500]
 * @param {string} [context='']  - Nombre del controller/función para identificar el origen
 */
function handleError(res, error, status = 500, context = '') {
  const tag = context ? `[${context}]` : '[Server]';

  // Siempre logear el error completo en servidor
  console.error(`${tag} Error:`, error);

  if (isDev) {
    return res.status(status).json({
      message: error.message,
      stack: error.stack,
      context,
    });
  }

  // En producción, no exponer detalles
  return res.status(status).json({
    message: 'Ha ocurrido un error interno. Por favor intenta de nuevo.',
  });
}

module.exports = { handleError };
