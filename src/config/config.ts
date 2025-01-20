import dotenv from 'dotenv';
dotenv.config();

export const config = {
    twitter: {
        username: process.env.TWITTER_USERNAME || '',
        password: process.env.TWITTER_PASSWORD || '',
        email: process.env.TWITTER_EMAIL || '',
    },
	trading: {
        minConfidenceScore: 0.85,
        monitoringInterval: 60000, // 60 seconds
        stopLossPercentage: 0.2,
        takeProfitPercentage: 2,
		maxPositions: 5,
        maxPositionSize: 5, // in SOL
		maxPositionSizeSOL: 5,
		minPositionSizeSOL: 3,
		slippageBps: 500,
		closePositionsOnShutdown: false,
		privateKey: process.env.PRIVATE_KEY || '',
		positionStaleThreshold: 60000, // 60 seconds
	},
};