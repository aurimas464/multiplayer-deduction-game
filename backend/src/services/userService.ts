import { UserModel } from "../models/user";
import { ResponseUser, responseUserSchema } from "../types/entities/user";
import { UserUpdateDTO } from "../types/controllers/user";
import { PlayerModel } from "../models/player";
import { validateIcon } from "../utils/validation";
import { ErrorCode } from "../types";
import { AppError } from "../types/index";
import { computeIconEtag } from "../utils/iconEtag";

class UserService {
	async getMe(userId: number): Promise<ResponseUser | null> {
		const user = await UserModel.findById(userId);
		const player = await PlayerModel.findByUserId(userId);
		if (!user || !player) return null;
		return responseUserSchema.parse({ ...user, player });
	}

	async updateUser(userId: number, data: UserUpdateDTO): Promise<boolean> {
		let iconEtag: string | undefined;

		if (data.icon !== undefined && data.icon !== "") {
			const result = await validateIcon(data.icon);

			if (!result.ok) {
				throw new AppError(ErrorCode.INVALID_ICON);
			}

			data.icon = result.value;
			iconEtag = computeIconEtag(result.value);
		}

		return await UserModel.update(userId, data, iconEtag);
	}

	async getIconEtag(playerId: number): Promise<string | null> {
		const player = await PlayerModel.findByUserId(playerId);
		return player?.iconEtag ?? null;
	}

	async getManyIcons(playerIds: number[]): Promise<Record<number, string>> {
		const icons = await PlayerModel.getIconsDataUrlByPlayerIds(playerIds);

		const result: Record<number, string> = {};
		for (const [playerId, icon] of icons) {
			result[playerId] = icon;
		}

		return result;
	}
}

export default new UserService();