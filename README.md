![Project Demo](./public/demo.gif)

# Aelio-core

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue.svg)](https://www.typescriptlang.org/)
[![Node.js Version](https://img.shields.io/badge/Node.js->=16.0.0-brightgreen.svg)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-5.0-green.svg)](https://www.mongodb.com/)
[![Docker](https://img.shields.io/badge/Docker-20.10+-blue.svg)](https://www.docker.com/)
[![Code Style: ESLint](https://img.shields.io/badge/Code_Style-ESLint-4B32C3.svg)](https://eslint.org/)

Aelio is an AI-powered trading system for Solana tokens that leverages sentiment analysis, holder behavior, and technical indicators to make informed trading decisions.

## 🌟 Features

- Real-time token monitoring on Solana blockchain
- Sentiment analysis from X (formerly Twitter)
- Holder behavior analysis and scoring
- Automated trading via Jupiter aggregator
- Risk management and position sizing
- Performance analytics and reporting
- Real-time monitoring and alerting
- RESTful API with authentication (soon)

## 🚀 Quick Start

### Prerequisites

- Node.js >= 16.0.0
- MongoDB >= 5.0
- Solana wallet with funds
- API keys for:
  - Helius
  - Twitter API v2
  - MongoDB (if using Atlas)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/AelioVC/aelio-core.git
cd aelio-core
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Build the project:
```bash
npm run build
```

### Development

Start in development mode:
```bash
npm run dev
```

Run tests:
```bash
npm test
```

### Production

Using Docker:
```bash
docker-compose up -d
```

Without Docker:
```bash
npm run build
npm start
```

## 🔧 Configuration

Key configuration options in `.env`:

```env
# API Keys
HELIUS_API_KEY=your_helius_api_key
TWITTER_API_KEY=your_twitter_api_key

# Trading
MAX_POSITIONS=10
MAX_POSITION_SIZE_SOL=5
STOP_LOSS_PERCENTAGE=0.1
```

See `.env.example` for all options.

## 📊 Architecture

```
src/
├── ai/
│   ├── sentiment.ts
│   └── trader.ts
├── api/
│   ├── middleware.ts
│   └── server.ts
├── core/
│   ├── Aelio.ts
│   ├── TokenMonitor.ts
│   └── TradingEngine.ts
├── services/
│   ├── database.ts
│   ├── helius.ts
│   └── twitter.ts
├── config/
│   └── config.ts
├── types/
│   └── types.ts
├── utils/
│   └── logger.ts
└── index.ts

```

## 📈 Trading Strategy

The system employs a multi-factor analysis approach:

1. **Sentiment Analysis**
   - Social media sentiment scoring
   - Volume of mentions
   - Influencer impact

2. **Holder Analysis**
   - Wallet behavior tracking
   - Historical trading performance
   - Concentration metrics

3. **Technical Analysis**
   - Price action
   - Volume analysis
   - Volatility metrics

4. **Risk Management**
   - Dynamic position sizing
   - Automated stop-loss
   - Take-profit optimization
   - Portfolio exposure limits

## 📊 Performance Monitoring

- Real-time position tracking
- P&L analysis
- Risk metrics
- System health monitoring

## 🔄 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📃 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🌟 Acknowledgments

- [Helius](https://helius.xyz/) - Solana data provider
- [Jupiter](https://jup.ag/) - Solana trading aggregator
- [Twitter API](https://developer.twitter.com/) - Social data
