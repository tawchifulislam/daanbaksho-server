const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const verifyToken = require('../middlewares/verifyToken');
const verifySupporter = require('../middlewares/verifySupporter');
const verifyAdmin = require('../middlewares/verifyAdmin');

// Supporter reports a campaign as suspicious/fraudulent
router.post('/', verifyToken, verifySupporter, async (req, res) => {
  const report = req.body;

  if (req.decoded.email !== report.reporter_email) {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  const newReport = {
    campaign_id: report.campaign_id,
    campaign_title: report.campaign_title,
    reporter_name: report.reporter_name,
    reporter_email: report.reporter_email,
    reason: report.reason,
    date: new Date(),
    status: 'pending',
  };

  const reportsCollection = req.app.locals.collections.reports;
  const result = await reportsCollection.insertOne(newReport);
  res.send(result);
});

// Admin: all reports
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  const reportsCollection = req.app.locals.collections.reports;
  const reports = await reportsCollection.find().sort({ date: -1 }).toArray();
  res.send(reports);
});

// Admin: suspend the reported campaign and mark the report resolved
router.patch('/:id/suspend', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const collections = req.app.locals.collections;

  const report = await collections.reports.findOne({ _id: new ObjectId(id) });
  if (!report) {
    return res.status(404).send({ message: 'Report not found' });
  }

  await collections.campaigns.updateOne(
    { _id: new ObjectId(report.campaign_id) },
    { $set: { status: 'suspended' } },
  );

  await collections.reports.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: 'resolved' } },
  );

  res.send({ message: 'Campaign suspended' });
});

// Admin: delete the reported campaign entirely and mark the report resolved
router.patch(
  '/:id/delete-campaign',
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const { id } = req.params;
    const collections = req.app.locals.collections;

    const report = await collections.reports.findOne({ _id: new ObjectId(id) });
    if (!report) {
      return res.status(404).send({ message: 'Report not found' });
    }

    const approvedContributions = await collections.contributions
      .find({ campaign_id: report.campaign_id, status: 'approved' })
      .toArray();

    for (const contribution of approvedContributions) {
      await collections.users.updateOne(
        { email: contribution.supporter_email },
        { $inc: { credits: contribution.contribution_amount } },
      );
    }

    await collections.campaigns.deleteOne({
      _id: new ObjectId(report.campaign_id),
    });

    await collections.reports.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'resolved' } },
    );

    res.send({ message: 'Campaign deleted and supporters refunded' });
  },
);

module.exports = router;
