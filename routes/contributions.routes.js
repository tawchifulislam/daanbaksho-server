const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const verifyToken = require('../middlewares/verifyToken');
const verifySupporter = require('../middlewares/verifySupporter');
const verifyCreator = require('../middlewares/verifyCreator');

// Supporter creates a new contribution - deducts credits immediately, holds status as pending
router.post('/', verifyToken, verifySupporter, async (req, res) => {
  const contribution = req.body;
  const collections = req.app.locals.collections;

  if (req.decoded.email !== contribution.supporter_email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const amount = Number(contribution.contribution_amount);

  const supporter = await collections.users.findOne({
    email: contribution.supporter_email,
  });
  if (!supporter || supporter.credits < amount) {
    return res.status(400).send({ message: 'Insufficient credits' });
  }

  const campaign = await collections.campaigns.findOne({
    _id: new ObjectId(contribution.campaign_id),
  });
  if (!campaign) {
    return res.status(404).send({ message: 'Campaign not found' });
  }
  if (amount < campaign.minimum_contribution) {
    return res.status(400).send({
      message: `Minimum contribution is ${campaign.minimum_contribution} credits`,
    });
  }

  await collections.users.updateOne(
    { email: contribution.supporter_email },
    { $inc: { credits: -amount } },
  );

  const newContribution = {
    ...contribution,
    contribution_amount: amount,
    status: 'pending',
    date: new Date(),
  };

  const result = await collections.contributions.insertOne(newContribution);

  await collections.notifications.insertOne({
    message: `${contribution.supporter_name} contributed ${amount} credits to "${campaign.title}"`,
    toEmail: campaign.creator_email,
    actionRoute: '/dashboard/creator-home',
    time: new Date(),
  });

  res.send(result);
});

// Creator: pending contributions for their campaigns
router.get('/creator/:email', verifyToken, verifyCreator, async (req, res) => {
  const { email } = req.params;
  const { status } = req.query;

  if (req.decoded.email !== email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const query = { creator_email: email };
  if (status) query.status = status;

  const contributionsCollection = req.app.locals.collections.contributions;
  const contributions = await contributionsCollection
    .find(query)
    .sort({ date: -1 })
    .toArray();
  res.send(contributions);
});

// Creator approves a contribution - adds amount to campaign's raised total
router.patch('/:id/approve', verifyToken, verifyCreator, async (req, res) => {
  const { id } = req.params;
  const collections = req.app.locals.collections;

  const contribution = await collections.contributions.findOne({
    _id: new ObjectId(id),
  });
  if (!contribution) {
    return res.status(404).send({ message: 'Contribution not found' });
  }
  if (contribution.creator_email !== req.decoded.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  await collections.contributions.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: 'approved' } },
  );

  await collections.campaigns.updateOne(
    { _id: new ObjectId(contribution.campaign_id) },
    { $inc: { raised_amount: contribution.contribution_amount } },
  );

  await collections.notifications.insertOne({
    message: `Your contribution of ${contribution.contribution_amount} credits to "${contribution.campaign_title}" was approved by ${contribution.creator_name}`,
    toEmail: contribution.supporter_email,
    actionRoute: '/dashboard/supporter-home',
    time: new Date(),
  });

  res.send({ message: 'Contribution approved' });
});

// Creator rejects a contribution - refunds the supporter's credits
router.patch('/:id/reject', verifyToken, verifyCreator, async (req, res) => {
  const { id } = req.params;
  const collections = req.app.locals.collections;

  const contribution = await collections.contributions.findOne({
    _id: new ObjectId(id),
  });
  if (!contribution) {
    return res.status(404).send({ message: 'Contribution not found' });
  }
  if (contribution.creator_email !== req.decoded.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  await collections.contributions.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: 'rejected' } },
  );

  await collections.users.updateOne(
    { email: contribution.supporter_email },
    { $inc: { credits: contribution.contribution_amount } },
  );

  await collections.notifications.insertOne({
    message: `Your contribution of ${contribution.contribution_amount} credits to "${contribution.campaign_title}" was rejected by ${contribution.creator_name}`,
    toEmail: contribution.supporter_email,
    actionRoute: '/dashboard/supporter-home',
    time: new Date(),
  });

  res.send({ message: 'Contribution rejected and refunded' });
});

// Supporter: all of their own contributions, paginated
router.get(
  '/supporter/:email',
  verifyToken,
  verifySupporter,
  async (req, res) => {
    const { email } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (req.decoded.email !== email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }

    const contributionsCollection = req.app.locals.collections.contributions;
    const skip = (Number(page) - 1) * Number(limit);

    const [contributions, total] = await Promise.all([
      contributionsCollection
        .find({ supporter_email: email })
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(limit))
        .toArray(),
      contributionsCollection.countDocuments({ supporter_email: email }),
    ]);

    res.send({ contributions, total });
  },
);

// Supporter: only approved contributions - used on the supporter home page
router.get(
  '/supporter/:email/approved',
  verifyToken,
  verifySupporter,
  async (req, res) => {
    const { email } = req.params;

    if (req.decoded.email !== email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }

    const contributionsCollection = req.app.locals.collections.contributions;
    const contributions = await contributionsCollection
      .find({ supporter_email: email, status: 'approved' })
      .sort({ date: -1 })
      .toArray();

    res.send(contributions);
  },
);

module.exports = router;
