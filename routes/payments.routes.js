const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const verifySupporter = require('../middlewares/verifySupporter');
const verifyAdmin = require('../middlewares/verifyAdmin');
const Stripe = require('stripe');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// Create a Stripe PaymentIntent for a given dollar amount
router.post(
  '/create-payment-intent',
  verifyToken,
  verifySupporter,
  async (req, res) => {
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).send({ message: 'Invalid amount' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'usd',
      payment_method_types: ['card'],
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  },
);

// Save a completed payment and add credits to the supporter's account
router.post('/', verifyToken, verifySupporter, async (req, res) => {
  const payment = req.body;
  const collections = req.app.locals.collections;

  if (req.decoded.email !== payment.supporter_email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const newPayment = {
    supporter_email: payment.supporter_email,
    supporter_name: payment.supporter_name,
    credits_purchased: Number(payment.credits_purchased),
    amount_paid: Number(payment.amount_paid),
    transaction_id: payment.transaction_id,
    payment_date: new Date(),
  };

  const result = await collections.payments.insertOne(newPayment);

  await collections.users.updateOne(
    { email: payment.supporter_email },
    { $inc: { credits: newPayment.credits_purchased } },
  );

  res.send(result);
});

// Supporter: their own payment history
router.get(
  '/supporter/:email',
  verifyToken,
  verifySupporter,
  async (req, res) => {
    const { email } = req.params;

    if (req.decoded.email !== email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }

    const paymentsCollection = req.app.locals.collections.payments;
    const payments = await paymentsCollection
      .find({ supporter_email: email })
      .sort({ payment_date: -1 })
      .toArray();

    res.send({ payments });
  },
);

// Admin: all payments
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  const paymentsCollection = req.app.locals.collections.payments;
  const payments = await paymentsCollection
    .find()
    .sort({ payment_date: -1 })
    .toArray();
  res.send(payments);
});

module.exports = router;
