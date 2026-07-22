const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const verifyToken = require('../middlewares/verifyToken');
const verifyCreator = require('../middlewares/verifyCreator');
const verifyAdmin = require('../middlewares/verifyAdmin');

// Creator requests a withdrawal - minimum 200 credits ($10), 20 credits = $1
router.post('/', verifyToken, verifyCreator, async (req, res) => {
  const withdrawal = req.body;
  const collections = req.app.locals.collections;

  if (req.decoded.email !== withdrawal.creator_email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const credit = Number(withdrawal.withdrawal_credit);

  if (credit < 200) {
    return res
      .status(400)
      .send({ message: 'Minimum withdrawal is 200 credits' });
  }

  const campaigns = await collections.campaigns
    .find({ creator_email: withdrawal.creator_email })
    .toArray();
  const totalRaised = campaigns.reduce(
    (sum, c) => sum + (c.raised_amount || 0),
    0,
  );

  const existingWithdrawals = await collections.withdrawals
    .find({ creator_email: withdrawal.creator_email })
    .toArray();
  const alreadyWithdrawn = existingWithdrawals.reduce(
    (sum, w) => sum + (w.withdrawal_credit || 0),
    0,
  );

  const availableCredit = totalRaised - alreadyWithdrawn;

  if (credit > availableCredit) {
    return res.status(400).send({ message: 'Insufficient credit' });
  }

  const newWithdrawal = {
    creator_email: withdrawal.creator_email,
    creator_name: withdrawal.creator_name,
    withdrawal_credit: credit,
    withdrawal_amount: credit / 20,
    payment_system: withdrawal.payment_system,
    account_number: withdrawal.account_number,
    status: 'pending',
    withdraw_date: new Date(),
  };

  const result = await collections.withdrawals.insertOne(newWithdrawal);
  res.send(result);
});

// Creator: their own withdrawal history
router.get('/creator/:email', verifyToken, verifyCreator, async (req, res) => {
  const { email } = req.params;

  if (req.decoded.email !== email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const withdrawalsCollection = req.app.locals.collections.withdrawals;
  const withdrawals = await withdrawalsCollection
    .find({ creator_email: email })
    .sort({ withdraw_date: -1 })
    .toArray();

  res.send(withdrawals);
});

// Admin: all pending withdrawal requests
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  const { status } = req.query;
  const withdrawalsCollection = req.app.locals.collections.withdrawals;

  const query = status ? { status } : {};
  const withdrawals = await withdrawalsCollection
    .find(query)
    .sort({ withdraw_date: -1 })
    .toArray();

  res.send(withdrawals);
});

// Admin marks a withdrawal as paid - notifies the creator
router.patch('/:id/approve', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const collections = req.app.locals.collections;

  const withdrawal = await collections.withdrawals.findOne({
    _id: new ObjectId(id),
  });
  if (!withdrawal) {
    return res.status(404).send({ message: 'Withdrawal request not found' });
  }

  await collections.withdrawals.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: 'approved' } },
  );

  await collections.notifications.insertOne({
    message: `Your withdrawal of ${withdrawal.withdrawal_credit} credits ($${withdrawal.withdrawal_amount}) has been processed`,
    toEmail: withdrawal.creator_email,
    actionRoute: '/dashboard/payment-history',
    time: new Date(),
  });

  res.send({ message: 'Withdrawal approved' });
});

module.exports = router;
