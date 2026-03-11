import { ErrorCode } from "../types/index";

export const en = {
	common: {
		save: "Save",
		cancel: "Cancel",
		error: "Error",
		success: "Success",
		loading: "Loading...",
		networkError: "Network error. Please check your connection.",
		timeoutError: "Request timeout. Please try again later.",
		on: "On",
		off: "Off"
	},
	pages: {
		login: {
			title: "Login",
			noAccount: "No account?",
			register: "Register",
			submit: "Login",
			registrationSuccess: "Registration successful. Please log in.",
			fields: {
				login: "Login",
				password: "Password",
			}
		},
		register: {
			title: "Register",
			submit: "Register",
			hasAccount: "Already have an account?",
			passwordsDontMatch: "Passwords do not match.",
			fields: {
				username: "Username",
				email: "Email",
				password: "Password",
				confirmPassword: "Confirm Password",
			}
		},
		home: {
			title: "Welcome",
			start: "New Game",
			join: "Join Game",
			leaderboard: "Leaderboards",
			logout: "Logout",
		},
		gameLobby: {
			gameRoomNotFound: "Game room not found",
			code: "Game code",
			ready: "Ready",
			leave: "Leave",
			unready: "Unready",
			players: "Players",
			settings: {
				title: "Settings",
				maxPlayers: "Max players in lobby",
				minPlayers: "Min players before start",
				dayTime: "Day time",
				votingTime: "Voting time",
				nightTime: "Night time",
				tieBehavior: "Tie Behavior",
				voteVisibility: "Vote visibility",
				dropdown: {
					noOneDies: "No one dies",
					randomTied: "Random among tied",
					revote: "Revote",
					never: "Never",
					end: "End of voting",
					live: "Live"
				},
				anonymousVoting: "Anonymous voting",
				roleReveal: "Role reveal on death"
			}
		}
	},
	components: {
		sidebar: {
			menu: "Menu",
			settings: {
				header: "Settings",
				languages: "Language",
				themes: "Themes",
				colorThemes: "Color Themes",
				icon: "Icon",
				iconPicker: "Icon upload (accepts .png, .jpg, .jpeg, .gif, .webp)",
				languageSelect: {
					english: "English",
					lithuanian: "Lithuanian",
				},
				themeSelect: {
					light: "Light",
					dark: "Dark",
				},
				colorThemeSelect: {
					red: "Red",
					blue: "Blue",
					purple: "Purple",
					gold: "Gold",
				},
				iconUpload: {
					invalidType: "Invalid file type. Only .png, .jpg, .jpeg, .gif, .webp are allowed.",
					readFailed: "Failed to read file.",
				},
				saveSuccessMessage: "Settings saved successfully",
			},
			chats: {
				header: "Chats",
			},
			friends: {
				header: "Friends",
			},
			notes: {
				header: "Notes",
			},
		},
		popups: {
			joinGame: {
				title: "Join game",
				gameCode: "Enter game code",
				join: "Join",
				loadingMessage: "Joining game..."
			}
		}
	},
	errors: {
		specific: {
			[ErrorCode.MISSING_FIELDS]: "{field} is required.",
			[ErrorCode.INVALID_TYPE]: "{field} is invalid type.",
			[ErrorCode.VALUE_EXISTS]: "{field} already exists.",
			[ErrorCode.INVALID_TOO_SHORT]: "{field} is too short.",
			[ErrorCode.INVALID_TOO_LONG]: "{field} is too long.",
			[ErrorCode.INVALID_EMAIL]: "{field} is invalid email.",
		},
		generic: {
			[ErrorCode.INVALID_REQUEST]: "Invalid request.",
			[ErrorCode.UNKNOWN_ERROR]: "An unknown error occurred.",
			[ErrorCode.NETWORK_ERROR]: "Network error. Please check your connection.",

			[ErrorCode.MISSING_FIELDS]: "Required fields are missing.",
			[ErrorCode.INVALID_TYPE]: "Invalid data type.",
			[ErrorCode.VALUE_EXISTS]: "This value already exists.",

			[ErrorCode.EXPIRED_TOKEN]: "Your session has expired. Please log in again.",
			[ErrorCode.INVALID_CREDENTIALS]: "Invalid login or password.",
			[ErrorCode.UNAUTHORIZED]: "You are not authorized to perform this action.",

			[ErrorCode.INVALID_TOO_SHORT]: "The value is too short.",
			[ErrorCode.INVALID_TOO_LONG]: "The value is too long.",
			[ErrorCode.INVALID_EMAIL]: "Invalid email address.",

			[ErrorCode.MISSING_REFRESH_TOKEN]: "Your session has expired. Please log in again.",
			[ErrorCode.INTERNAL_ERROR]: "Server error. Please try again later.",
			[ErrorCode.RATE_LIMIT_EXCEEDED]: "Too many requests. Please slow down.",

			[ErrorCode.INVALID_ICON]: "Invalid icon.",
			[ErrorCode.TOO_LARGE]: "Upload is too large.",

			[ErrorCode.NOT_IN_LOBBY]: "You are not in the lobby.",
			[ErrorCode.GAME_NOT_FOUND]: "Game not found.",

			[ErrorCode.INVALID_GAME_CODE]: "Invalid game code.",
			[ErrorCode.GAME_ALREADY_STARTED]: "The game has already started.",
			[ErrorCode.GAME_FULL]: "The game is full.",
			[ErrorCode.NOT_GAME_LEADER]: "You are not the game leader.",
			[ErrorCode.LOBBY_TOO_SMALL]: "Not enough players in the lobby to start.",
			[ErrorCode.GAME_NOT_CREATED]: "Failed to create game.",
			[ErrorCode.ALREADY_IN_GAME]: "You are already in a game.",
			[ErrorCode.INVALID_SEAT]: "Invalid seat.",
			[ErrorCode.SEAT_TAKEN]: "That seat is already taken.",
			[ErrorCode.USER_NOT_FOUND]: "User not found.",

			[ErrorCode.INVALID_USER_ID]: "Invalid user ID.",
			[ErrorCode.FRIENDSHIP_ALREADY_EXISTS]: "Friendship already exists.",
			[ErrorCode.FRIEND_REQUEST_NOT_FOUND]: "Friend request not found.",
			[ErrorCode.FRIENDSHIP_NOT_FOUND]: "Friendship not found.",
			[ErrorCode.USER_NOT_BLOCKED]: "User is not blocked.",
		},
	},
} as const;