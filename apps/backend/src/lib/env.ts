import dotenv from 'dotenv';

dotenv.config();

export interface BackendEnv {
  PORT: number;
  HOST: string;
}

export function loadEnv(): BackendEnv {
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  return {
    PORT: Number.isNaN(port) ? 4000 : port,
    HOST: process.env.HOST || '0.0.0.0',
  };
}
