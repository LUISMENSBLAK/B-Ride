const admin = require('../config/firebase');
const User = require('../models/User');

/**
 * protect — verifica Firebase ID Token en el header Authorization.
 * Compatible con el flujo anterior: si el token es un JWT propio (legacy),
 * lo intenta con jsonwebtoken como fallback durante la transición.
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'No autorizado, token requerido.' });
  }

  try {
    // Intentar verificar como Firebase ID Token
    const decoded = await admin.auth().verifyIdToken(token);
    
    // Buscar o crear usuario en MongoDB sincronizado con Firebase
    let user = await User.findOne({ firebaseUid: decoded.uid });

    if (!user) {
      // Usuario existe en Firebase pero no en MongoDB — crearlo (flujo OAuth)
      user = await User.findOne({ email: decoded.email });
      if (user) {
        // Vincular Firebase UID al usuario existente
        user.firebaseUid = decoded.uid;
        user.isEmailVerified = decoded.email_verified || false;
        await user.save();
      } else {
        return res.status(404).json({ success: false, message: 'Usuario no encontrado. Completa el registro.' });
      }
    }

    req.user = user;
    next();
  } catch (firebaseError) {
    // Fallback: tratar de descifrar como backend JWT local (Admin Panel & Legacy)
    try {
        const jwt = require('jsonwebtoken');
        const decodedJwt = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decodedJwt.id);
        if (!user) {
            return res.status(401).json({ success: false, message: 'No cuenta backend asociada al token.' });
        }
        req.user = user;
        next();
    } catch (jwtError) {
        return res.status(401).json({ success: false, message: 'Token inválido o expirado (Firebase & JWT).' });
    }
  }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `User role ${req.user.role} is not authorized to access this route`,
            });
        }
        next();
    };
};

const requireVerified = (req, res, next) => {
    if (!req.user.isEmailVerified && !req.user.emailVerified) {
        return res.status(403).json({
            success: false,
            message: 'Email must be verified to access this route',
        });
    }
    next();
};

module.exports = { protect, authorize, requireVerified };
