import { Scraper } from "agent-twitter-client";
import { config } from "../config/config";
import { SentimentAnalyzer } from "../ai/sentiment";
import marketMonitor from '../core/MarketMonitor';

export class TwitterService {
    private client: Scraper;
	private sentimentAnalyzer = new SentimentAnalyzer();

    constructor() {
        this.client = new Scraper();
        this.client.login(config.twitter.username, config.twitter.password, config.twitter.email)
            .catch(console.error);

		this.on('token', (ticker) => {
			this.getTweets(ticker).then(tweets => {
				this.sentimentAnalysis(tweets);
			});
		});
    }

    public emit(event: any, ...args: any[]): boolean {
        return marketMonitor.emit(event, ...args);
    }

	public on(event: any, listener: (...args: any[]) => void): void {
		marketMonitor.on(event, listener);
	}

	public sentimentAnalysis(tweets: string[]) {
		const res = this.sentimentAnalyzer.analyze(tweets);
		
		if(res.overall > 3) {
			this.emit('newToken', tweets);
		}
	}

	public async getTweets(symbol: string): Promise<string[]> {
        const query = `$${symbol}`;
        const tweets = await this.client.getTweets(query);
		// @ts-ignore
        return tweets.data.map(tweet => tweet.text);
    }
}