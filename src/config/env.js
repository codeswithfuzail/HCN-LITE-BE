import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000), NODE_ENV: z.string().default('development'),
  MONGODB_URI: z.string().min(1), MONGODB_DNS_SERVERS: z.string().optional().default(''), JWT_SECRET: z.string().min(24), JWT_EXPIRES_IN: z.string().default('8h'),
  FRONTEND_URL: z.string().url(), AI_API_KEY: z.string().optional(), AI_BASE_URL: z.string().url().optional(), AI_MODEL: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional().or(z.literal('')), ADMIN_PASSWORD: z.string().optional()
});
export const env = schema.parse(process.env);
