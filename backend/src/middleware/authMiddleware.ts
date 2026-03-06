import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config";
import { AppError, ErrorCode } from "../types";
import type { JwtPayload } from "../types/config";

declare global {
	namespace Express {
		interface Request {
			user?: JwtPayload;
		}
	}
}

export const authenticateToken = (req: Request, _res: Response, next: NextFunction): void => {
	const authHeader = req.headers.authorization;

	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		throw new AppError(ErrorCode.UNAUTHORIZED);
	}

	const token = authHeader.slice("Bearer ".length).trim();

	try {
		const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });

		if (typeof decoded !== "object" || decoded === null) {
			throw new AppError(ErrorCode.UNAUTHORIZED);
		}

		req.user = decoded as JwtPayload;
		next();
	} catch (err) {
		if (err instanceof jwt.TokenExpiredError) {
			throw new AppError(ErrorCode.EXPIRED_TOKEN);
		}
		throw new AppError(ErrorCode.UNAUTHORIZED);
	}
};

export const validateRefreshToken = (req: Request, _res: Response, next: NextFunction): void => {
	const refreshToken = req.cookies?.refreshToken;

	if (!refreshToken || typeof refreshToken !== "string") {
		throw new AppError(ErrorCode.MISSING_REFRESH_TOKEN);
	}

	next();
};