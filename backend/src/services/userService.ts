import { UserModel } from "../repositories/userRepository";
import { ResponseMeUser, responseMeUserSchema, PatchUser } from "../types/entities/user";
import { PlayerModel } from "../repositories/playerRepository";
import { validateIcon } from "../utils/validation";
import { ErrorCode } from "../types";
import { AppError } from "../types/index";
import crypto from "crypto";

class UserService {
	async getMe(userId: number): Promise<ResponseMeUser> {
		const user = await UserModel.findById(userId);
		const player = await PlayerModel.findByUserId(userId);
		if (!user || !player){
			throw new AppError(ErrorCode.USER_NOT_FOUND);
		}
		return responseMeUserSchema.parse({ ...user, player });
	}

	async patchUser(data: PatchUser): Promise<void> {
		let iconEtag: string | undefined;

		if (data.icon !== undefined && data.icon !== "") {
			const result = await validateIcon(data.icon);

			if (!result.ok) {
				throw new AppError(ErrorCode.INVALID_ICON);
			}

			data.icon = result.value;
			iconEtag = this.computeIconEtag(result.value);
		}

		await UserModel.patch({...data, iconEtag});
	}

	async getIconEtag(playerId: number): Promise<string | null> {
		return await PlayerModel.findIconEtagByPlayerId(playerId);
	}

	async getManyIcons(playerIds: number[]): Promise<Record<number, string>> {
		const limitedIds = [...new Set(playerIds)].slice(0, 20);
		const icons = await PlayerModel.findIconDataByPlayerIds(limitedIds);

		const result: Record<number, string> = {};
		for (const { id, icon } of icons) {
			result[id] = icon;
		}

		return result;
	}

	computeIconEtag(icon: string): string {
		return crypto.createHash("sha256").update(icon.trim(), "utf8").digest("hex");
	}
}

export default new UserService();
