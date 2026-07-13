const express = require('express');
const router = express.Router();

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

module.exports = router;
