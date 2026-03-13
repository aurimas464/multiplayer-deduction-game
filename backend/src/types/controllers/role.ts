import { Request, Response } from "express";

export interface IRoleController {
	getRoles(req: Request, res: Response): Promise<void>;
}