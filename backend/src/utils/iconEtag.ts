import crypto from "crypto";

export const computeIconEtag = (icon: string): string =>
	crypto.createHash("sha256").update(icon.trim(), "utf8").digest("hex");