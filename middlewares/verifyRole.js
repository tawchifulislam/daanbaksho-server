function verifyRole(allowedRole) {
  return async (req, res, next) => {
    const email = req.decoded?.email;
    if (!email) return res.status(401).send({ message: 'Unauthorized access' });

    const usersCollection = req.app.locals.collections.users;
    const user = await usersCollection.findOne({ email });

    if (!user || user.role !== allowedRole) {
      return res.status(403).send({ message: 'Forbidden access' });
    }
    next();
  };
}

module.exports = verifyRole;
