import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many attempts from this IP. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 25,
  message: { error: 'Upload rate limit reached. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: 'Too many requests. Please try again in a moment.' },
  standardHeaders: true,
  legacyHeaders: false
});
