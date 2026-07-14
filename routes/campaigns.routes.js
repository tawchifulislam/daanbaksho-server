const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const verifyToken = require('../middlewares/verifyToken');
const verifyCreator = require('../middlewares/verifyCreator');

// Create a new campaign (status starts as "pending")
router.post('/', verifyToken, verifyCreator, async (req, res) => {
  const campaign = req.body;

  if (req.decoded.email !== campaign.creator_email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const newCampaign = {
    ...campaign,
    funding_goal: Number(campaign.funding_goal),
    minimum_contribution: Number(campaign.minimum_contribution),
    raised_amount: 0,
    status: 'pending',
    createdAt: new Date(),
  };

  const campaignsCollection = req.app.locals.collections.campaigns;
  const result = await campaignsCollection.insertOne(newCampaign);
  res.send(result);
});

// Top 6 campaigns by raised amount, approved only
router.get('/top-funded', async (req, res) => {
  const campaignsCollection = req.app.locals.collections.campaigns;
  const topCampaigns = await campaignsCollection
    .find({ status: 'approved' })
    .sort({ raised_amount: -1 })
    .limit(6)
    .toArray();
  res.send(topCampaigns);
});

// Creator's own campaigns, sorted by deadline descending
router.get('/creator/:email', verifyToken, verifyCreator, async (req, res) => {
  const { email } = req.params;
  if (req.decoded.email !== email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const campaignsCollection = req.app.locals.collections.campaigns;
  const campaigns = await campaignsCollection
    .find({ creator_email: email })
    .sort({ deadline: -1 })
    .toArray();
  res.send(campaigns);
});

// Public list — approved campaigns with active deadline, supports pagination + basic filters
router.get('/', async (req, res) => {
  const { category, page = 1, limit = 9 } = req.query;
  const campaignsCollection = req.app.locals.collections.campaigns;

  const query = {
    status: 'approved',
    deadline: { $gte: new Date().toISOString() },
  };
  if (category) query.category = category;

  const skip = (Number(page) - 1) * Number(limit);

  const [campaigns, total] = await Promise.all([
    campaignsCollection.find(query).skip(skip).limit(Number(limit)).toArray(),
    campaignsCollection.countDocuments(query),
  ]);

  res.send({ campaigns, total });
});

// Single campaign details
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const campaignsCollection = req.app.locals.collections.campaigns;
  const campaign = await campaignsCollection.findOne({ _id: new ObjectId(id) });

  if (!campaign) {
    return res.status(404).send({ message: 'Campaign not found' });
  }
  res.send(campaign);
});

// Update campaign (only title, story, reward_info editable)
router.patch('/:id', verifyToken, verifyCreator, async (req, res) => {
  const { id } = req.params;
  const { title, story, reward_info } = req.body;

  const campaignsCollection = req.app.locals.collections.campaigns;
  const campaign = await campaignsCollection.findOne({ _id: new ObjectId(id) });

  if (!campaign) return res.status(404).send({ message: 'Campaign not found' });
  if (campaign.creator_email !== req.decoded.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const result = await campaignsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { title, story, reward_info } },
  );
  res.send(result);
});

// Delete campaign + refund all approved supporters
router.delete('/:id', verifyToken, verifyCreator, async (req, res) => {
  const { id } = req.params;
  const collections = req.app.locals.collections;

  const campaign = await collections.campaigns.findOne({
    _id: new ObjectId(id),
  });
  if (!campaign) return res.status(404).send({ message: 'Campaign not found' });
  if (campaign.creator_email !== req.decoded.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  // Refund approved supporters
  const approvedContributions = await collections.contributions
    .find({ campaign_id: id, status: 'approved' })
    .toArray();

  for (const contribution of approvedContributions) {
    await collections.users.updateOne(
      { email: contribution.supporter_email },
      { $inc: { credits: contribution.contribution_amount } },
    );
  }

  await collections.campaigns.deleteOne({ _id: new ObjectId(id) });
  res.send({
    message: 'Campaign deleted and supporters refunded',
    refundedCount: approvedContributions.length,
  });
});

module.exports = router;
