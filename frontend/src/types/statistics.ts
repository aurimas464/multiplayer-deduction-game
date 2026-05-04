export type StatisticsSnapshot = {
	updatedAt: number;
	lastManualRefresh: number;
	totals: {
		games: number;
		friendships: number;
		directMessages: number;
		gameMessages: number;
		actions: number;
		notes: number;
	};
	games: {
		victories: Array<{ alignment: string; count: number }>;
		player: {
			wins: number;
			losses: number;
			aliveAtEnd: number;
			deadAtEnd: number;
		};
		popularGameSettings: {
			roleDistributionMode: Array<{ value: string; count: number }>;
			tieBehavior: Array<{ value: string; count: number }>;
			voteCountVisibility: Array<{ value: string; count: number }>;
			anonymousVoting: Array<{ value: boolean; count: number }>;
			roleRevealOnDeath: Array<{ value: boolean; count: number }>;
		};
		averages: {
			participantsPerGame: number;
			actionsPerGame: number;
			gameMessagesPerGame: number;
			directMessagesPerChat: number;
			alivePlayersPerFinishedGame: number;
			deadPlayersPerFinishedGame: number;
			durationSeconds: {
				day: number;
				voting: number;
				night: number;
			};
		};
		topRoles: Array<{ roleKey: string; count: number }>;
		topActions: Array<{ actionKey: string; count: number }>;
	};
	activity: {
		last24h: {
			usersCreated: number;
			gamesCreated: number;
			directMessagesSent: number;
			gameMessagesSent: number;
			actionsSaved: number;
		};
	};
};
