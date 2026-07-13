const { MongoClient, ServerApiVersion } = require('mongodb');

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let dbInstance = null;

async function connectDB() {
  if (dbInstance) return dbInstance;
  await client.connect();
  dbInstance = client.db('daanbaksho');
  console.log('MongoDB connected');
  return dbInstance;
}

module.exports = { connectDB };
