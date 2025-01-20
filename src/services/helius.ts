import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config/config';
import { TokenData, Holder } from '../types/types';

interface HeliusTokenResponse {
    mint: string;
    symbol: string;
    name: string;
    decimals: number;
    volumeUsd24h: number;
    priceUsd: number;
    metadata: {
        mint: string;
        owners: Array<{
            address: string;
            amount: number;
        }>;
        supply: number;
    };
}

interface HeliusHolderHistoryResponse {
    address: string;
    transactions: Array<{
        signature: string;
        timestamp: number;
        type: string;
        amount: number;
        price: number;
    }>;
}

export class HeliusService {
    private connection: Connection;
    private headers: HeadersInit;

    constructor() {
        this.connection = new Connection(config.helius.endpoint);
        this.headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.helius.apiKey}`
        };
    }

    async getNewTokens(timeframe: number = 3600): Promise<string[]> {
        try {
            const response = await fetch(`${config.helius.endpoint}/v0/tokens/activity/new?timeframe=${timeframe}`, {
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.tokens.map((token: any) => token.mint);
        } catch (error) {
            console.error('Error fetching new tokens:', error);
            throw error;
        }
    }

    async getTokenData(address: string): Promise<TokenData> {
        try {
            // Validate address format
            const mintAddress = new PublicKey(address);
            
            // Fetch token data
            const response = await fetch(`${config.helius.endpoint}/v0/tokens/${mintAddress.toString()}`, {
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data: HeliusTokenResponse = await response.json();
            
            // Fetch holder data
            const holders = await this.getTokenHolders(address);
            
            // Format and return the data
            return this.formatTokenData(data, holders);
        } catch (error) {
            console.error('Error fetching token data:', error);
            throw error;
        }
    }

    private async getTokenHolders(address: string): Promise<Holder[]> {
        try {
            const response = await fetch(`${config.helius.endpoint}/v0/tokens/${address}/holders`, {
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const holders: Holder[] = [];

            // Process top holders
            for (const holder of data.holders.slice(0, 20)) { // Get top 20 holders
                const tradingScore = await this.calculateHolderTradingScore(holder.address, address);
                holders.push({
                    address: holder.address,
                    balance: holder.amount,
                    tradingScore
                });
            }

            return holders;
        } catch (error) {
            console.error('Error fetching token holders:', error);
            return [];
        }
    }

    private async calculateHolderTradingScore(holderAddress: string, tokenAddress: string): Promise<number> {
        try {
            // Fetch holder's trading history for this token
            const response = await fetch(`${config.helius.endpoint}/v0/addresses/${holderAddress}/transactions`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify({
                    query: {
                        tokens: [tokenAddress],
                        timeframe: "1M" // Last month
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const history: HeliusHolderHistoryResponse = await response.json();
            
            // Calculate trading score based on:
            // 1. Number of profitable trades
            // 2. Average holding time
            // 3. Transaction frequency
            
            let profitableTrades = 0;
            let totalTrades = 0;
            let avgHoldingTime = 0;
            
            const trades = history.transactions
                .sort((a, b) => a.timestamp - b.timestamp);
            
            for (let i = 0; i < trades.length - 1; i++) {
                const buyTx = trades[i];
                const sellTx = trades[i + 1];
                
                if (buyTx.type === 'buy' && sellTx.type === 'sell') {
                    totalTrades++;
                    
                    // Calculate profit
                    if (sellTx.price > buyTx.price) {
                        profitableTrades++;
                    }
                    
                    // Calculate holding time
                    avgHoldingTime += sellTx.timestamp - buyTx.timestamp;
                }
            }
            
            avgHoldingTime = totalTrades > 0 ? avgHoldingTime / totalTrades : 0;
            
            // Calculate final score (0-1)
            const profitScore = totalTrades > 0 ? profitableTrades / totalTrades : 0;
            const frequencyScore = Math.min(totalTrades / 10, 1); // Max score at 10 trades/month
            const holdingScore = Math.min(avgHoldingTime / (7 * 24 * 3600), 1); // Max score at 1 week holding
            
            return (profitScore * 0.5 + frequencyScore * 0.3 + holdingScore * 0.2);
        } catch (error) {
            console.error('Error calculating holder trading score:', error);
            return 0;
        }
    }

    private formatTokenData(data: HeliusTokenResponse, holders: Holder[]): TokenData {
        return {
            address: data.mint,
            symbol: data.symbol,
            name: data.name,
            price: data.priceUsd,
            volume24h: data.volumeUsd24h,
            holders: holders,
            sentimentScore: 0, // This will be set by the sentiment analysis service
            marketCap: data.priceUsd * data.metadata.supply,
            supply: data.metadata.supply,
            decimals: data.decimals,
            holderCount: data.metadata.owners.length,
            riskScore: this.calculateRiskScore(data, holders)
        };
    }

    private calculateRiskScore(data: HeliusTokenResponse, holders: Holder[]): number {
        // Calculate risk score based on various factors
        const holderConcentration = this.calculateHolderConcentration(holders);
        const liquidityScore = this.calculateLiquidityScore(data.volumeUsd24h, data.priceUsd * data.metadata.supply);
        const supplyScore = this.calculateSupplyScore(data.metadata.supply, holders);

        return (
            holderConcentration * 0.4 +
            liquidityScore * 0.4 +
            supplyScore * 0.2
        );
    }

    private calculateHolderConcentration(holders: Holder[]): number {
        // Calculate Gini coefficient for holder distribution
        const totalSupply = holders.reduce((sum, holder) => sum + holder.balance, 0);
        const sortedBalances = holders
            .map(holder => holder.balance / totalSupply)
            .sort((a, b) => a - b);

        let sumSoFar = 0;
        let giniNumerator = 0;

        for (let i = 0; i < sortedBalances.length; i++) {
            sumSoFar += sortedBalances[i];
            giniNumerator += sumSoFar;
        }

        const giniCoefficient = 
            (sortedBalances.length + 1 - 2 * giniNumerator / sumSoFar) / 
            sortedBalances.length;

        // Convert to risk score (higher concentration = higher risk)
        return giniCoefficient;
    }

    private calculateLiquidityScore(volume24h: number, marketCap: number): number {
        // Calculate liquidity score based on volume/market cap ratio
        const liquidityRatio = volume24h / marketCap;
        return Math.min(liquidityRatio * 100, 1); // Cap at 1
    }

    private calculateSupplyScore(totalSupply: number, holders: Holder[]): number {
        // Calculate supply score based on circulation and distribution
        const circulatingSupply = holders.reduce((sum, holder) => sum + holder.balance, 0);
        const circulationRatio = circulatingSupply / totalSupply;
        return Math.min(circulationRatio, 1);
    }
}