import { ErrorCode } from "../types/index";

export const en = {
	common: {
		save: "Save",
		cancel: "Cancel",
		confirm: "Confirm",
		close: "Close",
		info: "Info",
		error: "Error",
		success: "Success",
		loading: "Loading...",
		back: "Back",
		networkError: "Network error. Please check your connection.",
		timeoutError: "Request timeout. Please try again later.",
		on: "On",
		off: "Off",
		yes: "Yes",
		no: "No"
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
			statistics: "Statistics",
			logout: "Logout",
		},
		statistics: {
			title: "Statistics",
			public: "Public",
			personal: "Personal",
			refresh: "Refresh",
			noData: "No data",
			never: "Never",
			updatedAt: "Updated {date}",
			lastRefresh: "Last manual refresh: {date}",
			sections: {
				totals: "Totals",
				publicResults: "All Player Results",
				personalResults: "Your Results",
				averages: "Averages",
				activity: "Last 24 Hours",
				victories: "Victories",
				topRoles: "Top Roles",
				topActions: "Top Actions",
				settings: "Popular Settings"
			},
			metrics: {
				games: "Games",
				friendships: "Friendships",
				directMessages: "Direct Messages",
				gameMessages: "Game Messages",
				actions: "Actions",
				notes: "Notes",
				totalWins: "Total Wins",
				totalLosses: "Total Losses",
				wins: "Wins",
				losses: "Losses",
				winRate: "Win Rate",
				aliveAtEnd: "Alive At End",
				deadAtEnd: "Dead At End",
				participantsPerGame: "Players / Game",
				actionsPerGame: "Actions / Game",
				gameMessagesPerGame: "Game Messages / Game",
				directMessagesPerChat: "Direct Messages / Chat",
				alivePlayersPerFinishedGame: "Alive / Finished Game",
				deadPlayersPerFinishedGame: "Dead / Finished Game",
				daySeconds: "Day Length",
				votingSeconds: "Voting Length",
				nightSeconds: "Night Length",
				usersCreated: "Users Created",
				gamesCreated: "Games Created",
				directMessagesSent: "Direct Messages Sent",
				gameMessagesSent: "Game Messages Sent",
				actionsSaved: "Actions Saved"
			},
			settings: {
				roleDistributionMode: "Distribution",
				tieBehavior: "Tie Behavior",
				voteCountVisibility: "Vote Visibility",
				anonymousVoting: "Anonymous Voting",
				roleRevealOnDeath: "Role Reveal"
			}
		},
		gameLobby: {
			gameRoomNotFound: "Game room not found",
			code: "Game code",
			ready: "Ready",
			leave: "Leave",
			unready: "Unready",
			players: "Players",
			kickedFromGame: "You have been kicked from the game",
			addBot: "Add Bot",
			gameStarting: "Game Starting",
			startingIn: "Starting in...",
			startCancelled: "Game start cancelled",
			validation: {
				rolesMustEqualPlayers: "Roles ({totalRoles}) must equal players ({playerCount})",
				needCommuneAndVampire: "Need at least 1 Commune and 1 Vampire role"
			},
			botSettings: {
				difficulty: "Difficulty",
				playstyle: "Playstyle",
				difficultyOptions: {
					random: "Random",
					easy: "Easy",
					normal: "Normal",
					hard: "Hard"
				},
				playstyleOptions: {
					random: "Random",
					balanced: "Balanced",
					aggressive: "Aggressive",
					passive: "Passive",
					deceptive: "Deceptive",
					defensive: "Defensive",
					chaotic: "Chaotic"
				}
			},
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
					no_one_dies: "No one dies",
					random_among_tied: "Random among tied",
					never: "Never",
					end: "End of voting",
					live: "Live",
					exact: "Exact",
					weighted_random: "Weighted random"
				},
				alignments: {
					commune: "Commune",
					vampire: "Vampire",
					neutral: "Neutral"
				},
				anonymousVoting: "Anonymous voting",
				roleReveal: "Role reveal on death",
				roleDistributionMode: "Distribution mode",
			}
		},
		game: {
			gameNotFound: "Game not found",
			code: "Code",
			roleReveal: "Your Role",
			roleRevealLabel: "Your role is",
			chat: "Game Chat",
			phaseTransition: "Phase Transition",
			phases: {
				day: "Day",
				voting: "Voting",
				night: "Night"
			},
			alignments: {
				good: "good",
				bad: "bad"
			},
			players: {
				unknown: "Player #{playerId}"
			},
			actionNames: {
				vote: "Vote",
				skip: "Skip",
				eliminate: "Eliminate",
				convert: "Convert",
				inspect: "Inspect",
				watch: "Watch",
				jail: "Jail",
				protect: "Protect",
				guess: "Guess"
			},
			actions: {
				vampireActions: "Vampire Actions",
				countActions: "Count Actions",
				convertPlayer: "Convert Player",
				killTarget: "Kill Target",
				bloodBankActions: "Blood Bank Actions",
				visionaryActions: "Visionary Actions",
				vigilanteActions: "Vigilante Actions",
				watchmanActions: "Watchman Actions",
				jailorActions: "Jailor Actions",
				priestActions: "Priest Actions",
				jesterActions: "Jester Actions",
				serialKillerActions: "Serial Killer Actions",
				chroniclerActions: "Chronicler Actions",
				noSpecialActions: "No special actions available",
				action: "Action",
				vote: "Vote",
				voteForElimination: "Vote for Elimination",
				discussWithPlayers: "Discuss with other players",
				nightElimination: "Night Elimination",
				convertTarget: "Convert Target",
				inspectAlignment: "Inspect Alignment",
				eliminateTarget: "Eliminate Target",
				watchTarget: "Watch Target",
				jailTarget: "Jail Target",
				protectTarget: "Protect Target",
				guessRoleHolder: "Guess Role Holder",
				skipAction: "Skip",
				skipped: "Skipped",
				currentlySkipping: "Currently skipping",
				submitted: "Action submitted",
				votingPrompt: "Choose a vote or skip",
				nightPrompt: "Choose an action or skip",
				eliminatedPrompt: "You are eliminated",
				jailedPrompt: "You are jailed and cannot act",
				unavailable: "That action is not available right now",
				selectPlayerTo: "Select a player to {action}",
				whatYouAreDoing: "Action",
				targetablePlayers: "Targetable players",
				noTargets: "No targetable players",
				invalidActionType: "Invalid action type: {action}",
				descriptions: {
					vote: "Choose a living player to vote against",
					vampire: "Can eliminate a chosen player every second night; dies if no elimination is performed for three cycles",
					bloodBank: "Can eliminate a chosen player every second night; while alive, other vampires can miss eliminations for up to five cycles",
					count: "Can eliminate a chosen player every second night; once per game can convert a chosen player into a vampire",
					visionary: "Can inspect a player and learn whether their alignment is good or bad. Good means commune, while bad includes vampires and neutral roles.",
					vigilante: "Can eliminate a chosen player; dies if the target is a commune member",
					watchman: "Can watch a player and learn which players targeted them during the night",
					jailor: "Can jail a player and block their next-cycle actions, including voting",
					priest: "Can protect a player from night elimination and learn whether an elimination was aimed at that player",
					serialKiller: "Can eliminate a chosen player every night; wins after personally eliminating half of all players",
					chronicler: "Receives a random unguessed role each night and can guess which player has it. Wins after correctly guessing one quarter of all roles."
				}
			},
			results: {
				phaseTitle: "{phase} Results",
				personalTitle: "{phase} Result",
				dayEnded: "Day discussion ended",
				votingNoElimination: "Voting ended with no elimination",
				votingEliminated: "Voting eliminated {players}",
				nightPeaceful: "Night ended peacefully",
				nightEliminated: "Night ended with {players} eliminated",
				votesRecorded: "{count} vote(s) recorded",
				votes: "Votes",
				personal: "Personal results",
				eliminated: "Eliminated",
				anonymousVoter: "Anonymous",
				voteSkipped: "skipped",
				voteTarget: "voted for {target}"
			},
			personal: {
				eliminate: "You attacked {player}",
				convert: "You converted {player}",
				inspect: "{player} appears {alignment}",
				watchVisitors: "{player} was visited by {visitors}",
				watchNone: "{player} had no visitors",
				jailApplied: "{player} was jailed",
				jailFailed: "Jail on {player} failed",
				jailed: "You were jailed",
				protectSaved: "Your protection saved {player}",
				protectQuiet: "{player} was not attacked",
				guessCorrect: "Correct: {player} had {role}",
				guessIncorrect: "Incorrect: {player} did not have {role}",
				chroniclerTarget: "Your next Chronicler target role is {role}",
				converted: "You were converted into a vampire"
			},
			finished: {
				title: "Game Results",
				vampires: "Vampires",
				winnerMessage: "{winner} win the game",
				winners: "Winners: {winners}",
				endedOnDay: "Game ended on day {day}",
				finalRoles: "Final Roles",
				timeline: "Action Timeline",
				columns: {
					day: "Day",
					phase: "Phase",
					player: "Player",
					role: "Role",
					status: "Status",
					action: "Action",
					target: "Target"
				},
				status: {
					alive: "Alive",
					eliminated: "Eliminated"
				}
			},
			roles: {
				commoner: "Commoner",
				visionary: "Visionary",
				vigilante: "Vigilante",
				watchman: "Watchman",
				jailor: "Jailor",
				priest: "Priest",
				jester: "Jester",
				serialKiller: "Serial Killer",
				chronicler: "Chronicler"
			}
		}
	},
	components: {
		sidebar: {
			menu: "Menu",
			chat: "Chat",
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
					dynamic: "Dynamic"
				},
				colorThemeSelect: {
					red: "Red",
					blue: "Blue",
					purple: "Purple",
					gold: "Gold",
				},
				iconUpload: {
					invalidType: "Invalid file type. Only .png, .jpg, .jpeg, .gif, .webp are allowed.",
					readFailed: "Failed to read file",
				},
				saveSuccessMessage: "Settings saved successfully",
			},
			chats: "Chats",
			friends: "Friends",
			notes: {
				header: "Notes",
			},
			direct: "Direct",
			game: "Game"
		},
		popups: {
			joinGame: {
				title: "Join game",
				gameCode: "Enter game code",
				join: "Join",
				accept: "Accept",
				loadingMessage: "Joining game...",
				inviteMessage: "{username} invited you",
				defaultUsername: "Player"
			},
			startingTimeout: {
				title: "Game Starting",
				message: "Starting in {seconds} seconds..."
			}
		}
	},
	friends: {
		search: {
			placeholder: "Search for friends...",
			friendsFilter: "Filter friends..."
		},
		sendRequest: "Send friend request",
		receivedRequests: "Received requests from:",
		pendingRequests: "Pending",
		accept: "Accept",
		reject: "Reject",
		cancel: "Cancel",
		cancelRequest: "Cancel request",
		noFriends: "Nothing found",
		startChat: "Start chat",
		actions: {
			chat: "Chat",
			inviteToGame: "Invite to Game",
			unfriend: "Unfriend",
			block: "Block",
			unblock: "Unblock",
		},
		blockedUsers: {
			showBlockedUsers: "Blocked",
		},
		confirm: {
			unfriendTitle: "Remove friend",
			unfriendMessage: "Remove {username} from friends?",
			blockTitle: "Block user",
			blockMessage: "Block {username}?",
			cancelRequestTitle: "Cancel friend request",
			cancelRequestMessage: "Cancel friend request to {username}?",
			unblockTitle: "Unblock user",
			unblockMessage: "Unblock {username}?"
		},
		success: {
			friendRequestReceived: "Friend Request Received",
			friendRequestReceivedMessage: "You received a friend request from {username}",
			friendRequestSent: "Friend Request Sent",
			friendRequestSentMessage: "Friend request sent to {username}",
			friendRequestCancelled: "Friend Request Cancelled",
			friendRequestCancelledMessage: "Friend request cancelled successfully",
			friendRequestAccepted: "Friend Request Accepted",
			friendRequestAcceptedMessage: "You are now friends with {username}",
			friendRequestRejected: "Friend Request Rejected",
			friendRequestRejectedMessage: "Friend request rejected successfully",
			friendRemoved: "Friend Removed",
			friendRemovedMessage: "Friend removed successfully",
			userBlocked: "User Blocked",
			userBlockedMessage: "{username} has been blocked",
			userUnblocked: "User Unblocked",
			userUnblockedMessage: "User unblocked successfully",
			inviteSent: "Invite Sent",
			inviteSentMessage: "Game invite sent successfully"
		},
		error: {
			fetchFriends: "Failed to fetch friends",
			fetchPendingRequests: "Failed to fetch pending requests",
			fetchSentRequests: "Failed to fetch sent requests",
			fetchBlockedUsers: "Failed to fetch blocked users"
		}
	},
	chat: {
		back: "Back to chat list",
		game: "Game",
		openInPopup: "Open in popup",
		noMessages: "No messages yet. Start the conversation!",
		beginning: "Beginning of conversation",
		typeMessage: "Type a message...",
		send: "Send",
		messageDeleted: "[message deleted]",
		lockedInput: "Chat is locked right now",
		actions: {
			edit: "Edit message",
			delete: "Delete message"
		},
		delete: {
			confirmTitle: "Delete message",
			confirmMessage: "Are you sure you want to delete this message?"
		}
	},
	notes: {
		empty: "Nothing found",
		search: {
			placeholder: "Filter notes..."
		},
		fields: {
			title: "Title",
			content: "Content"
		},
		error: {
			fetchNotes: "Failed to fetch notes"
		},
		validation: {
			titleRequired: "Title is required",
			contentRequired: "Content is required"
		},
		actions: {
			new: "New note",
			refresh: "Refresh",
			edit: "Edit",
			delete: "Delete"
		},
		create: {
			success: "Note created successfully",
			error: "Failed to create note",
			confirmTitle: "Create note",
			confirmMessage: "Create this note?"
		},
		edit: {
			success: "Note updated successfully",
			error: "Failed to update note",
			confirmTitle: "Save note",
			confirmMessage: "Save note changes?"
		},
		cancel: {
			confirmTitle: "Discard changes",
			confirmMessage: "Discard your changes?"
		},
		delete: {
			success: "Note deleted successfully",
			error: "Failed to delete note",
			confirmTitle: "Delete note",
			confirmMessage: "Delete note \"{title}\"?"
		},
		popup: {
			createTitle: "Create note",
			viewTitle: "View note",
			unsavedTitle: "Unsaved changes"
		},
		messages: {
			validation: "Title and content are required",
			saveSuccess: "Note saved successfully",
			saveError: "Failed to save note",
			deleteSuccess: "Note deleted successfully",
			deleteError: "Failed to delete note",
			unsaved: "You have unsaved changes. Save or discard before closing."
		}
	},
	roles: {
		powerLevel: "Power level",
		keys: {
			vampire: "Vampire",
			count: "Count",
			bloodBank: "Blood Bank",
			bloodbank: "Blood Bank",
			commoner: "Commoner",
			visionary: "Visionary",
			vigilante: "Vigilante",
			watchman: "Watchman",
			jailor: "Jailor",
			priest: "Priest",
			jester: "Jester",
			serialKiller: "Serial Killer",
			chronicler: "Chronicler"
		},
		descriptions: {
			vampire: "Can eliminate a chosen player every second night; dies if no elimination is performed for three cycles.",
			bloodBank: "Can eliminate a chosen player every second night; while alive, other vampires can miss eliminations for up to five cycles.",
			bloodbank: "Can eliminate a chosen player every second night; while alive, other vampires can miss eliminations for up to five cycles.",
			count: "Can eliminate a chosen player every second night; once per game can convert a chosen player into a vampire.",
			commoner: "Has no special abilities.",
			visionary: "Can inspect a player and learn whether their alignment is good or bad. Good means commune, while bad includes vampires and neutral roles.",
			vigilante: "Can eliminate a chosen player; dies if the target is a commune member.",
			watchman: "Can watch a player and learn which players targeted them during the night.",
			jailor: "Can jail a player and block their next-cycle actions, including voting.",
			priest: "Can protect a player from night elimination and learn whether an elimination was aimed at that player.",
			jester: "Has no special abilities; wins if eliminated during voting.",
			serialKiller: "Can eliminate a chosen player every night; wins after personally eliminating half of all players.",
			chronicler: "Receives a random unguessed role each night and can guess which player has it. Wins after correctly guessing one quarter of all roles."
		}
	},
	errors: {
			specific: {
				[ErrorCode.MISSING_FIELDS]: "{field} is required",
				[ErrorCode.INVALID_TYPE]: "{field} is invalid type",
				[ErrorCode.VALUE_EXISTS]: "{field} already exists",
				[ErrorCode.INVALID_TOO_SHORT]: "{field} is too short",
				[ErrorCode.INVALID_TOO_LONG]: "{field} is too long",
				[ErrorCode.INVALID_EMAIL]: "{field} is invalid email",
			},
			generic: {
				[ErrorCode.INVALID_REQUEST]: "Invalid request",
				[ErrorCode.UNKNOWN_ERROR]: "An unknown error occurred",
				[ErrorCode.NETWORK_ERROR]: "Network error. Please check your connection",
				[ErrorCode.MISSING_FIELDS]: "Required fields are missing",
				[ErrorCode.INVALID_TYPE]: "Invalid data type",
				[ErrorCode.VALUE_EXISTS]: "This value already exists",
				[ErrorCode.EXPIRED_TOKEN]: "Your session has expired. Please log in again",
				[ErrorCode.INVALID_CREDENTIALS]: "Invalid login or password",
				[ErrorCode.UNAUTHORIZED]: "You are not authorized to perform this action",
				[ErrorCode.INVALID_TOO_SHORT]: "The value is too short",
				[ErrorCode.INVALID_TOO_LONG]: "The value is too long",
				[ErrorCode.INVALID_EMAIL]: "Invalid email address",
				[ErrorCode.MISSING_REFRESH_TOKEN]: "Your session has expired. Please log in again",
				[ErrorCode.INTERNAL_ERROR]: "Server error. Please try again later",
				[ErrorCode.RATE_LIMIT_EXCEEDED]: "Too many requests. Please slow down",
				[ErrorCode.INVALID_ICON]: "Invalid icon",
				[ErrorCode.TOO_LARGE]: "Upload is too large",
				[ErrorCode.PLAYER_NOT_IN_LOBBY]: "You are not in the lobby",
				[ErrorCode.GAME_NOT_FOUND]: "Game not found",
				[ErrorCode.INVALID_GAME_CODE]: "Invalid game code",
				[ErrorCode.GAME_NOT_IN_LOBBY]: "The game has already started or is no longer available",
				[ErrorCode.GAME_ALREADY_STARTED]: "The game has already started",
				[ErrorCode.GAME_FULL]: "The game is full",
				[ErrorCode.NOT_GAME_LEADER]: "You are not the game leader",
				[ErrorCode.LOBBY_TOO_SMALL]: "Not enough players in the lobby to start",
				[ErrorCode.GAME_NOT_CREATED]: "Failed to create game",
				[ErrorCode.ALREADY_IN_GAME]: "You are already in a game",
				[ErrorCode.INVALID_SEAT]: "Invalid seat",
				[ErrorCode.SEAT_TAKEN]: "That seat is already taken",
				[ErrorCode.INVALID_ACTION]: "That action is not available right now",
				[ErrorCode.PLAYER_ELIMINATED]: "Eliminated players cannot do that",
				[ErrorCode.CHAT_NOT_ALLOWED]: "Chat is not available during this phase",
				[ErrorCode.USER_NOT_FOUND]: "User not found",
				[ErrorCode.FRIENDSHIP_ALREADY_EXISTS]: "Friendship already exists",
				[ErrorCode.FRIENDSHIP_ALREADY_SENT]: "Friend request already sent",
				[ErrorCode.FRIEND_REQUEST_EXISTS]: "Friend request already exists",
				[ErrorCode.FRIENDSHIP_NOT_FOUND]: "Friendship not found",
				[ErrorCode.USER_BLOCKED]: "User is blocked",
				[ErrorCode.BOT_NOT_ADDED]: "Failed to add bot",
				[ErrorCode.USER_NOT_FRIEND]: "User is not your friend",
				[ErrorCode.FRIENDS_LIMIT_REACHED]: "Friends limit reached",
				[ErrorCode.FRIEND_REQUEST_OUTGOING_LIMIT_REACHED]: "Outgoing friend request limit reached",
				[ErrorCode.FRIEND_REQUEST_INCOMING_LIMIT_REACHED]: "Incoming friend request limit reached",
				[ErrorCode.TOO_SOON]: "Please wait before trying again",
			},
	},
} as const;

