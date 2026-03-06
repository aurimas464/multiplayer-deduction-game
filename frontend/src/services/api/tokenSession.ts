const ACCESS_TOKEN_KEY = "accessToken";

let accessToken: string | null = sessionStorage.getItem(ACCESS_TOKEN_KEY);

export const tokenSession = {
	get() {
		return accessToken;
	},

	set(token: string | null) {
		accessToken = token;

		if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
		else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
	},

	clear() {
		accessToken = null;
		sessionStorage.removeItem(ACCESS_TOKEN_KEY);
	},
};