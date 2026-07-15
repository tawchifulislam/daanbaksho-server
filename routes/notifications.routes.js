const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');

// Notifications for the logged-in user, newest first
router.get('/:email', verifyToken, async (req, res) => {
  const { email } = req.params;

  if (req.decoded.email !== email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const notificationsCollection = req.app.locals.collections.notifications;
  const notifications = await notificationsCollection
    .find({ toEmail: email })
    .sort({ time: -1 })
    .toArray();

  res.send(notifications);
});

module.exports = router;
