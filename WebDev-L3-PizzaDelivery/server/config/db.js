import dns from 'node:dns';
import mongoose from 'mongoose';

async function ensureSrvDns(uri) {
  if (!uri?.startsWith('mongodb+srv://')) return;
  const host = uri.replace('mongodb+srv://', '').split('@').pop().split(/[/?]/)[0];
  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch (err) {
    if (['EBADRESP', 'ESERVFAIL', 'ETIMEOUT', 'ECONNREFUSED'].includes(err.code)) {
      const servers = (process.env.MONGODB_DNS_SERVERS || '9.9.9.9,149.112.112.112').split(',');
      dns.setServers(servers);
    }
  }
}

export async function connectDB(uri = process.env.MONGODB_URI) {
  await ensureSrvDns(uri);
  return mongoose.connect(uri);
}
