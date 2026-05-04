import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

import prisma from "../../prisma/client";
import config from "../config";

import { UserModel, UserModelTransaction } from "../repositories/userRepository";
import { SessionModel } from "../repositories/sessionRepository";
import { PlayerModel } from "../repositories/playerRepository";

import { AppError, ErrorCode } from "../types";
import { User, CreateUser, ResponseUser, responseUserSchema } from "../types/entities/user";

class AuthService {
	async register(data: CreateUser): Promise<ResponseUser> {
		const existingUser = await UserModel.findByUsername(data.username);
		if (existingUser) throw new AppError(ErrorCode.VALUE_EXISTS, [{ field: "username", code: ErrorCode.VALUE_EXISTS }]);

		const existingEmail = await UserModel.findByEmail(data.email);
		if (existingEmail) throw new AppError(ErrorCode.VALUE_EXISTS, [{ field: "email", code: ErrorCode.VALUE_EXISTS }]);

		const hashedPassword = await bcrypt.hash(data.password, 10);

		return prisma.$transaction(async (tx) => {
			const userModel = UserModelTransaction(tx);
			const created = await userModel.create({ ...data, password: hashedPassword });
			return responseUserSchema.parse(created);
		});
	}

	async login(login: string, password: string) : Promise<{ accessToken: string; refreshToken: string; userData: ResponseUser }> {
		const user = await UserModel.findByEmailOrName(login);
		if (!user) throw new AppError(ErrorCode.INVALID_CREDENTIALS);

		const isValid = await this.validateCredentials(password, user.password);
		if (!isValid) throw new AppError(ErrorCode.INVALID_CREDENTIALS);

		const player = await PlayerModel.findByUserId(user.id);
		if (!player) throw new AppError(ErrorCode.INTERNAL_ERROR);

		const rawRefreshToken = this.createRefreshToken();
		const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);

		const session = await SessionModel.create({
			userId: user.id,
			refreshTokenHash,
			refreshExpiresAt: this.getRefreshTokenExpiry()
		});
		if (!session) throw new AppError(ErrorCode.INTERNAL_ERROR);

		const accessToken = this.createAccessToken(user, player.id);
		const userData = responseUserSchema.parse({ ...user, player });

		return { accessToken, refreshToken: rawRefreshToken, userData };
	}

	async refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
		const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);

		const session = await SessionModel.findByValidTokenHash(refreshTokenHash);
		if (!session) throw new AppError(ErrorCode.EXPIRED_TOKEN);

		const user = await UserModel.findById(session.userId);
		if (!user) throw new AppError(ErrorCode.EXPIRED_TOKEN);

		const player = await PlayerModel.findByUserId(user.id);
		if (!player) throw new AppError(ErrorCode.INTERNAL_ERROR);

		const newRawRefreshToken = this.createRefreshToken();
		const newRefreshTokenHash = this.hashRefreshToken(newRawRefreshToken);

		const updatedCount = await SessionModel.rotateByTokenHash(session, {
			userId: session.userId,
			refreshTokenHash: newRefreshTokenHash,
			refreshExpiresAt: this.getRefreshTokenExpiry()
		});

		if (updatedCount !== 1) {
			throw new AppError(ErrorCode.EXPIRED_TOKEN);
		}

		const accessToken = this.createAccessToken(user, player.id);

		return { accessToken, refreshToken: newRawRefreshToken };
	}

	async logout(rawRefreshToken: string): Promise<void> {
		const refreshTokenHash = this.hashRefreshToken(rawRefreshToken);
		await SessionModel.deleteByTokenHash(refreshTokenHash);
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

	private async validateCredentials(passwordInput: string, passwordDatabase: string): Promise<boolean> {
		if (!passwordInput || !passwordDatabase) return false;
		return bcrypt.compare(passwordInput, passwordDatabase);
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