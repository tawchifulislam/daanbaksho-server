const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const verifyCreator = require('../middlewares/verifyCreator');
const verifyAdmin = require('../middlewares/verifyAdmin');

// Creator's own campaign stats — total/active campaign count, total raised
router.get(
  '/creator-stats/:email',
  verifyToken,
  verifyCreator,
  async (req, res) => {
    const { email } = req.params;

    if (req.decoded.email !== email) {
      return res.status(403).send({ message: 'Forbidden access' });
    }

    const campaignsCollection = req.app.locals.collections.campaigns;
    const campaigns = await campaignsCollection
      .find({ creator_email: email })
      .toArray();

    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter(
      c => new Date(c.deadline) >= new Date(),
    ).length;
    const totalRaised = campaigns.reduce(
      (sum, c) => sum + (c.raised_amount || 0),
      0,
    );

    res.send({ totalCampaigns, activeCampaigns, totalRaised });
  },
);

// Platform-wide stats for the admin home page
router.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
  const collections = req.app.locals.collections;

  const [totalSupporters, totalCreators, users, totalPayments] =
    await Promise.all([
      collections.users.countDocuments({ role: 'supporter' }),
      collections.users.countDocuments({ role: 'creator' }),
      collections.users.find().toArray(),
      collections.payments.countDocuments(),
    ]);

  const totalCredits = users.reduce((sum, u) => sum + (u.credits || 0), 0);

  res.send({ totalSupporters, totalCreators, totalCredits, totalPayments });
});

module.exports = router;
