const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'apotek-sehatfarma-secret-2024';

function authMiddleware(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, message: 'Token tidak ditemukan' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Token tidak valid atau kadaluarsa' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin')
    return res.status(403).json({ success: false, message: 'Hanya admin yang dapat mengakses ini' });
  next();
}

module.exports = { authMiddleware, adminOnly, JWT_SECRET };
