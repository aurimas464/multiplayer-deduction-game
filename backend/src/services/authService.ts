import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

import prisma from "../prisma";
import config from "../config";

import { UserModel, UserModelTransaction } from "../models/user";
import { PlayerModel, PlayerModelTransaction } from "../models/player";
import { TokenSessionModel, TokenSessionModelTransaction } from "../models/tokenSession";

import { User } from "../types/entities/user";
import { responseUserSchema } from "../types/entities/user";
import { UserLoginDTO, UserRegisterDTO } from "../types/controllers/auth";
import { AppError, ErrorCode } from "../types";

class AuthService {
	async register(data: UserRegisterDTO) {
		const existingUser = await UserModel.findByUsername(data.username);
		if (existingUser) {
			throw new AppError(ErrorCode.VALUE_EXISTS, [{ field: "username", code: ErrorCode.VALUE_EXISTS }]);
		}

		const existingEmail = await UserModel.findByEmail(data.email);
		if (existingEmail) {
			throw new AppError(ErrorCode.VALUE_EXISTS, [{ field: "email", code: ErrorCode.VALUE_EXISTS }]);
		}

		const hashedPassword = await bcrypt.hash(data.password, 10);

		return prisma.$transaction(async (tx) => {
			const userModel = UserModelTransaction(tx);
			const created = await userModel.create({ ...data, password: hashedPassword });
			return responseUserSchema.parse(created);
		});
	}

	async login(data: UserLoginDTO) {
		const user = await UserModel.findByEmailOrName(data.login);
		if (!user) throw new AppError(ErrorCode.INVALID_CREDENTIALS);

		const passwordData = await UserModel.findPasswordById(user.id);
		if (!passwordData) throw new AppError(ErrorCode.INVALID_CREDENTIALS);

		const isValid = await this.validateCredentials(data.password, passwordData.password);
		if (!isValid) throw new AppError(ErrorCode.INVALID_CREDENTIALS);

		const player = await PlayerModel.findByUserId(user.id);
		if (!player) throw new AppError(ErrorCode.INTERNAL_ERROR);

		const rawRefreshToken = this.createRefreshToken();
		const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);

		const session = await TokenSessionModel.createOrUpdate({
			userId: user.id,
			refreshTokenHash,
			refreshExpiresAt: this.getRefreshTokenExpiry(),
		});
		if (!session) throw new AppError(ErrorCode.INTERNAL_ERROR);

		const accessToken = this.createAccessToken(user, player.id);
		const userData = responseUserSchema.parse({ ...user, player });

		return { accessToken, refreshToken: rawRefreshToken, userData };
	}

	async refresh(rawRefreshToken: string) {
		const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);

		return prisma.$transaction(async (tx) => {
			const sessionModel = TokenSessionModelTransaction(tx);
			const session = await sessionModel.findValidByTokenHash(refreshTokenHash);
			if (!session) throw new AppError(ErrorCode.EXPIRED_TOKEN);

			const userModel = UserModelTransaction(tx);
			const user = await userModel.findById(session.userId);
			if (!user) throw new AppError(ErrorCode.EXPIRED_TOKEN);

			const playerModel = PlayerModelTransaction(tx);
			const player = await playerModel.findByUserId(user.id);
			if (!player) throw new AppError(ErrorCode.INTERNAL_ERROR);

			const newRawRefreshToken = this.createRefreshToken();
			const newRefreshTokenHash = this.hashRefreshToken(newRawRefreshToken);

			const newSession = await sessionModel.createOrUpdate({userId: user.id, refreshTokenHash: newRefreshTokenHash, refreshExpiresAt: this.getRefreshTokenExpiry()});
			if (!newSession) throw new AppError(ErrorCode.INTERNAL_ERROR);

			const accessToken = this.createAccessToken(user, player.id);

			return { accessToken, refreshToken: newRawRefreshToken };
		});
	}

	async logout(rawRefreshToken: string): Promise<boolean> {
		const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);

		return TokenSessionModel.deleteByTokenHash(refreshTokenHash);
	}

	private createAccessToken(user: User, playerId: number): string {
		return jwt.sign(
			{
				userId: user.id,
				playerId,
				username: user.username,
				email: user.email,
			},
			config.jwtSecret,
			{ expiresIn: "1h", algorithm: "HS256" }
		);
	}

	private async validateCredentials(passwordInput: string, passwordDb: string): Promise<boolean> {
		if (!passwordInput || !passwordDb) return false;
		return bcrypt.compare(passwordInput, passwordDb);
	}

	private createRefreshToken(): string {
		return uuidv4();
	}

	private hashRefreshToken(token: string): string {
		return crypto.createHash("sha256").update(token).digest("hex");
	}

	private getRefreshTokenExpiry(): Date {
		return new Date(Date.now() + config.cookie.maxAgeDays * 24 * 60 * 60 * 1000);
	}
}

export default new AuthService();