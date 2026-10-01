import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET', 'dev-insecure-secret-change-me'),
  androidPackage: process.env.ANDROID_PACKAGE ?? '',
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '',
  appleSharedSecret: process.env.APPLE_SHARED_SECRET ?? '',
  isProd: process.env.NODE_ENV === 'production',
};

/** True when real purchase verification is configured. */
export const purchaseVerificationEnabled =
  Boolean(env.googleServiceAccountJson) || Boolean(env.appleSharedSecret);
