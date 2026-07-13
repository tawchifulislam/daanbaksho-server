const { jwtVerify, createRemoteJWKSet } = require('jose-cjs');

const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.decoded = payload;
    next();
  } catch (err) {
    return res.status(401).send({ message: 'Unauthorized access' });
  }
}

module.exports = verifyToken;
