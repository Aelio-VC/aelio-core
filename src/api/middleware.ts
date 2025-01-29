import { Request, Response, NextFunction } from 'express';
import { config } from '../config/config';

export const authenticateApiKey = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== config.api.apiKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
};