const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/verifyToken');
const verifyCreator = require('../middlewares/verifyCreator');

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

module.exports = router;
