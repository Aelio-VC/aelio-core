import dotenv from 'dotenv';
dotenv.config();

export const config = {
    twitter: {
        username: process.env.TWITTER_USERNAME || '',
        password: process.env.TWITTER_PASSWORD || '',
        email: process.env.TWITTER_EMAIL || '',
    }
};