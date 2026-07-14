const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const verifyToken = require('../middlewares/verifyToken');
const verifyAdmin = require('../middlewares/verifyAdmin');

// Get a single user's info (role, credits, etc.) — only the user themself can access
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

// Admin: get all users
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  const usersCollection = req.app.locals.collections.users;
  const users = await usersCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(users);
});

// Admin: update a user's role
router.patch('/:id/role', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!['admin', 'creator', 'supporter'].includes(role)) {
    return res.status(400).send({ message: 'Invalid role' });
  }

  const usersCollection = req.app.locals.collections.users;
  const result = await usersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role } },
  );

  res.send(result);
});

// Admin: remove a user
router.delete('/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const usersCollection = req.app.locals.collections.users;
  const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

module.exports = router;
