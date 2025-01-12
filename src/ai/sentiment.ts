import natural from 'natural';
import { SentimentData } from '../types/types';

export class SentimentAnalyzer {
	private analyzer: any;

	constructor() {
		this.analyzer = new natural.SentimentAnalyzer();
	}

	analyze(texts: string[]): SentimentData {
		let positive = 0;
		let negative = 0;
		let neutral = 0;

		texts.forEach(text => {
			const score = this.analyzer.getSentiment(text);
			if (score > 0) positive++;
			else if (score < 0) negative++;
			else neutral++;
		});

		const total = texts.length;
		return {
			positive: positive / total,
			negative: negative / total,
			neutral: neutral / total,
			overall: (positive - negative) / total,
			timestamp: Date.now()
		};
	}
}