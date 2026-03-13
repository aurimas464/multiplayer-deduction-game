import { Request, Response } from "express";
import { ApiResponse } from "../types";
import RoleService from "../services/roleService";
import { IRoleController } from "../types/controllers/role";

class RoleController implements IRoleController {
	async getRoles(req: Request, res: Response): Promise<void> {
		void req;

		const dto = await RoleService.getRoles();
		
		const successResponse: ApiResponse = {
			success: true,
			result: dto,
		};

		res.status(200).json(successResponse);
	}
}

export default new RoleController();