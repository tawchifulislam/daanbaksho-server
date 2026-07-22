const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const verifyToken = require('../middlewares/verifyToken');
const verifyCreator = require('../middlewares/verifyCreator');
const verifyAdmin = require('../middlewares/verifyAdmin');

// Create a new campaign - status starts as "pending" until admin approval
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

// Top 6 approved campaigns by raised amount - used on the homepage
router.get('/top-funded', async (req, res) => {
  const campaignsCollection = req.app.locals.collections.campaigns;
  const topCampaigns = await campaignsCollection
    .find({ status: 'approved' })
    .sort({ raised_amount: -1 })
    .limit(6)
    .toArray();

  res.send(topCampaigns);
});

// Admin: all campaigns, optionally filtered by status
router.get('/admin/all', verifyToken, verifyAdmin, async (req, res) => {
  const { status } = req.query;
  const campaignsCollection = req.app.locals.collections.campaigns;

  const query = status ? { status } : {};
  const campaigns = await campaignsCollection
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
  res.send(campaigns);
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

// Public list - approved campaigns with an active deadline, paginated, optional category filter
router.get('/', async (req, res) => {
  const { category, page = 1, limit = 9 } = req.query;
  const campaignsCollection = req.app.locals.collections.campaigns;

  const query = { status: 'approved' };
  if (category) query.category = category;

  const skip = (Number(page) - 1) * Number(limit);

  const allMatching = await campaignsCollection.find(query).toArray();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeCampaigns = allMatching.filter(
    c => new Date(c.deadline) >= today,
  );

  const total = activeCampaigns.length;
  const campaigns = activeCampaigns.slice(skip, skip + Number(limit));

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

// Admin: approve or reject a pending campaign, notifies the creator
router.patch('/:id/status', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).send({ message: 'Invalid status' });
  }

  const campaignsCollection = req.app.locals.collections.campaigns;
  const notificationsCollection = req.app.locals.collections.notifications;

  const campaign = await campaignsCollection.findOne({ _id: new ObjectId(id) });
  if (!campaign) {
    return res.status(404).send({ message: 'Campaign not found' });
  }

  await campaignsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status } },
  );

  await notificationsCollection.insertOne({
    message: `Your campaign "${campaign.title}" was ${status} by the admin`,
    toEmail: campaign.creator_email,
    actionRoute: '/dashboard/my-campaigns',
    time: new Date(),
  });

  res.send({ message: `Campaign ${status}` });
});

// Update campaign - only title, story, and reward_info are editable, owner only
router.patch('/:id', verifyToken, verifyCreator, async (req, res) => {
  const { id } = req.params;
  const { title, story, reward_info, deadline, image_url } = req.body;

  const campaignsCollection = req.app.locals.collections.campaigns;
  const campaign = await campaignsCollection.findOne({ _id: new ObjectId(id) });

  if (!campaign) {
    return res.status(404).send({ message: 'Campaign not found' });
  }
  if (campaign.creator_email !== req.decoded.email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const updateFields = { title, story, reward_info, deadline };
  if (image_url) {
    updateFields.image_url = image_url;
  }

  const result = await campaignsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateFields },
  );

  res.send(result);
});

// Delete campaign - owner or admin, refunds all approved supporters
router.delete('/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const collections = req.app.locals.collections;

  const campaign = await collections.campaigns.findOne({
    _id: new ObjectId(id),
  });
  if (!campaign) {
    return res.status(404).send({ message: 'Campaign not found' });
  }

  const requester = await collections.users.findOne({
    email: req.decoded.email,
  });
  const isOwner = campaign.creator_email === req.decoded.email;
  const isAdmin = requester?.role === 'admin';

  if (!isOwner && !isAdmin) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

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
