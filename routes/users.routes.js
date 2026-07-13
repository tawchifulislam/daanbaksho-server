const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');

// Get a single user's info (role, credits, etc.)
router.get('/:email', verifyToken, async (req, res) => {
  const { email } = req.params;

  if (req.decoded.email !== email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const usersCollection = req.app.locals.collections.users;
  const user = await usersCollection.findOne({ email });

  if (!user) {
    return res.status(404).send({ message: 'User not found' });
  }

  res.send(user);
});

module.exports = router;
