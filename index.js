const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { connectDB } = require('./config/db');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({ origin: [process.env.CLIENT_URL], credentials: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('DaanBaksho server is running');
});

async function start() {
  const db = await connectDB();

  app.locals.db = db;
  app.locals.collections = {
    users: db.collection('users'),
    campaigns: db.collection('campaigns'),
    contributions: db.collection('contributions'),
    withdrawals: db.collection('withdrawals'),
    payments: db.collection('payments'),
    notifications: db.collection('notifications'),
    reports: db.collection('reports'),
  };

  app.use('/users', require('./routes/users.routes'));
  app.use('/campaigns', require('./routes/campaigns.routes'));
  app.use('/contributions', require('./routes/contributions.routes'));
  app.use('/withdrawals', require('./routes/withdrawals.routes'));
  app.use('/payments', require('./routes/payments.routes'));
  app.use('/notifications', require('./routes/notifications.routes'));
  app.use('/reports', require('./routes/reports.routes'));
  app.use('/', require('./routes/stats.routes'));

  app.listen(port, () => {
    console.log(`DaanBaksho server listening on port ${port}`);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
