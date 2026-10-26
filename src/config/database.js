import mongoose from 'mongoose';
import { env } from './env.js';
let connectionPromise;
export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(env.MONGODB_URI).catch(error => {
      connectionPromise = undefined;
      throw error;
    });
  }
  return connectionPromise;
}
