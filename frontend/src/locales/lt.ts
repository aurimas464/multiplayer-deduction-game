import { ErrorCode } from "../types/index";

export const lt = {
	common: {
		save: "Išsaugoti",
		cancel: "Atšaukti",
		confirm: "Patvirtinti",
		close: "Uždaryti",
		info: "Informacija",
		error: "Klaida",
		success: "Pavyko",
		loading: "Įkeliama...",
		back: "Atgal",
		networkError: "Tinklo klaida. Patikrinkite ryšį.",
		timeoutError: "Užklausa užtruko per ilgai. Bandykite vėliau.",
		on: "Įjungta",
		off: "Išjungta",
		yes: "Taip",
		no: "Ne"
	},
	pages: {
		login: {
			title: "Prisijungimas",
			noAccount: "Neturite paskyros?",
			register: "Registruotis",
			submit: "Prisijungti",
			registrationSuccess: "Registracija sėkminga. Prisijunkite.",
			fields: {
				login: "Prisijungimo vardas",
				password: "Slaptažodis",
			}
		},
		register: {
			title: "Registracija",
			submit: "Registruotis",
			hasAccount: "Jau turite paskyrą?",
			passwordsDontMatch: "Slaptažodžiai nesutampa.",
			fields: {
				username: "Naudotojo vardas",
				email: "El. paštas",
				password: "Slaptažodis",
				confirmPassword: "Pakartokite slaptažodį",
			}
		},
		home: {
			title: "Sveiki",
			start: "Naujas žaidimas",
			join: "Prisijungti prie žaidimo",
			statistics: "Statistika",
			logout: "Atsijungti",
		},
		statistics: {
			title: "Statistika",
			public: "Vieša",
			personal: "Asmeninė",
			refresh: "Atnaujinti",
			noData: "Duomenų nėra",
			never: "Niekada",
			updatedAt: "Atnaujinta {date}",
			lastRefresh: "Paskutinis rankinis atnaujinimas: {date}",
			sections: {
				totals: "Bendrai",
				publicResults: "Visų žaidėjų rezultatai",
				personalResults: "Jūsų rezultatai",
				averages: "Vidurkiai",
				activity: "Per paskutines 24 valandas",
				victories: "Pergalės",
				topRoles: "Dažniausi vaidmenys",
				topActions: "Dažniausi veiksmai",
				settings: "Populiarūs nustatymai"
			},
			metrics: {
				games: "Žaidimai",
				friendships: "Draugystės",
				directMessages: "Asmeninės žinutės",
				gameMessages: "Žaidimo žinutės",
				actions: "Veiksmai",
				notes: "Užrašai",
				totalWins: "Pergalės iš viso",
				totalLosses: "Pralaimėjimai iš viso",
				wins: "Pergalės",
				losses: "Pralaimėjimai",
				winRate: "Pergalių dalis",
				aliveAtEnd: "Išgyveno pabaigoje",
				deadAtEnd: "Eliminuoti pabaigoje",
				participantsPerGame: "Žaidėjai / žaidimas",
				actionsPerGame: "Veiksmai / žaidimas",
				gameMessagesPerGame: "Žaidimo žinutės / žaidimas",
				directMessagesPerChat: "Asmeninės žinutės / pokalbis",
				alivePlayersPerFinishedGame: "Išgyvenę / baigtas žaidimas",
				deadPlayersPerFinishedGame: "Eliminuoti / baigtas žaidimas",
				daySeconds: "Dienos trukmė",
				votingSeconds: "Balsavimo trukmė",
				nightSeconds: "Nakties trukmė",
				usersCreated: "Sukurti naudotojai",
				gamesCreated: "Sukurti žaidimai",
				directMessagesSent: "Išsiųstos asmeninės žinutės",
				gameMessagesSent: "Išsiųstos žaidimo žinutės",
				actionsSaved: "Išsaugoti veiksmai"
			},
			settings: {
				roleDistributionMode: "Paskirstymas",
				tieBehavior: "Lygiosios",
				voteCountVisibility: "Balsų matomumas",
				anonymousVoting: "Anoniminis balsavimas",
				roleRevealOnDeath: "Vaidmens atskleidimas"
			}
		},
		gameLobby: {
			gameRoomNotFound: "Žaidimo kambarys nerastas",
			code: "Žaidimo kodas",
			ready: "Pasiruošęs",
			leave: "Išeiti",
			unready: "Nepasiruošęs",
			players: "Žaidėjai",
			kickedFromGame: "Buvote pašalintas iš žaidimo",
			addBot: "Pridėti botą",
			gameStarting: "Žaidimas prasideda",
			startingIn: "Prasideda po...",
			startCancelled: "Žaidimo pradžia atšaukta",
			validation: {
				rolesMustEqualPlayers: "Vaidmenų skaičius ({totalRoles}) turi sutapti su žaidėjų skaičiumi ({playerCount})",
				needCommuneAndVampire: "Reikia bent 1 bendruomenės ir 1 vampyro vaidmens"
			},
			botSettings: {
				difficulty: "Sudėtingumas",
				playstyle: "Žaidimo stilius",
				difficultyOptions: {
					random: "Atsitiktinis",
					easy: "Lengvas",
					normal: "Įprastas",
					hard: "Sunkus"
				},
				playstyleOptions: {
					random: "Atsitiktinis",
					balanced: "Subalansuotas",
					aggressive: "Agresyvus",
					passive: "Pasyvus",
					deceptive: "Klaidinantis",
					defensive: "Gynybinis",
					chaotic: "Chaotiškas"
				}
			},
			settings: {
				title: "Nustatymai",
				maxPlayers: "Didžiausias žaidėjų skaičius",
				minPlayers: "Mažiausias žaidėjų skaičius pradžiai",
				dayTime: "Dienos trukmė",
				votingTime: "Balsavimo trukmė",
				nightTime: "Nakties trukmė",
				tieBehavior: "Lygiųjų sprendimas",
				voteVisibility: "Balsų matomumas",
				dropdown: {
					no_one_dies: "Niekas nemiršta",
					random_among_tied: "Atsitiktinai iš lygiųjų",
					never: "Niekada",
					end: "Balsavimo pabaigoje",
					live: "Gyvai",
					exact: "Tikslus",
					weighted_random: "Svertinis atsitiktinis"
				},
				alignments: {
					commune: "Bendruomenė",
					vampire: "Vampyrai",
					neutral: "Neutralūs"
				},
				anonymousVoting: "Anoniminis balsavimas",
				roleReveal: "Atskleisti vaidmenį mirus",
				roleDistributionMode: "Paskirstymo būdas",
			}
		},
		game: {
			gameNotFound: "Žaidimas nerastas",
			code: "Kodas",
			roleReveal: "Jūsų vaidmuo",
			roleRevealLabel: "Jūsų vaidmuo yra",
			chat: "Žaidimo pokalbis",
			phaseTransition: "Fazės pasikeitimas",
			phases: {
				day: "Diena",
				voting: "Balsavimas",
				night: "Naktis"
			},
			alignments: {
				good: "gera",
				bad: "bloga"
			},
			players: {
				unknown: "Žaidėjas #{playerId}"
			},
			actionNames: {
				vote: "Balsuoti",
				skip: "Praleisti",
				eliminate: "Eliminuoti",
				convert: "Paversti",
				inspect: "Tikrinti",
				watch: "Stebėti",
				jail: "Įkalinti",
				protect: "Apsaugoti",
				guess: "Spėti"
			},
			actions: {
				vampireActions: "Vampyro veiksmai",
				countActions: "Grafo veiksmai",
				convertPlayer: "Paversti žaidėją",
				killTarget: "Eliminuoti taikinį",
				bloodBankActions: "Kraujo banko veiksmai",
				visionaryActions: "Regėtojo veiksmai",
				vigilanteActions: "Budelio veiksmai",
				watchmanActions: "Sargo veiksmai",
				jailorActions: "Kalėjimo prižiūrėtojo veiksmai",
				priestActions: "Kunigo veiksmai",
				jesterActions: "Juokdario veiksmai",
				serialKillerActions: "Serijinio žudiko veiksmai",
				chroniclerActions: "Metraštininko veiksmai",
				noSpecialActions: "Specialių veiksmų nėra",
				action: "Veiksmas",
				vote: "Balsuoti",
				voteForElimination: "Balsuoti už eliminavimą",
				discussWithPlayers: "Diskutuokite su kitais žaidėjais",
				nightElimination: "Naktinis eliminavimas",
				convertTarget: "Paversti taikinį",
				inspectAlignment: "Tikrinti frakciją",
				eliminateTarget: "Eliminuoti taikinį",
				watchTarget: "Stebėti taikinį",
				jailTarget: "Įkalinti taikinį",
				protectTarget: "Apsaugoti taikinį",
				guessRoleHolder: "Spėti vaidmens turėtoją",
				skipAction: "Praleisti",
				skipped: "Praleista",
				currentlySkipping: "Šiuo metu praleidžiama",
				submitted: "Veiksmas pateiktas",
				votingPrompt: "Pasirinkite balsą arba praleiskite",
				nightPrompt: "Pasirinkite veiksmą arba praleiskite",
				eliminatedPrompt: "Esate eliminuotas",
				jailedPrompt: "Esate įkalintas ir negalite veikti",
				unavailable: "Šis veiksmas dabar negalimas",
				selectPlayerTo: "Pasirinkite žaidėją veiksmui: {action}",
				whatYouAreDoing: "Veiksmas",
				targetablePlayers: "Galimi taikiniai",
				noTargets: "Galimų taikinių nėra",
				invalidActionType: "Netinkamas veiksmo tipas: {action}",
				descriptions: {
					vote: "Pasirinkite gyvą žaidėją, prieš kurį balsuosite",
					vampire: "Gali eliminuoti pasirinktą žaidėją kas antrą naktį; jei per tris ciklus neatlieka eliminacijos, miršta",
					bloodBank: "Gali eliminuoti pasirinktą žaidėją kas antrą naktį; kol yra gyvas, kiti vampyrai gali neatlikti eliminacijos iki penkių ciklų",
					count: "Gali eliminuoti pasirinktą žaidėją kas antrą naktį; kartą per žaidimą gali paversti pasirinktą žaidėją vampyru",
					visionary: "Gali pasirinkti žaidėją ir sužinoti jo frakciją (gera arba bloga). Gera frakcija yra bendruomenės, o bloga frakcija apima vampyrus ir neutralius.",
					vigilante: "Gali eliminuoti pasirinktą žaidėją; jei eliminuoja bendruomenės narį, pats miršta",
					watchman: "Gali pasirinkti žaidėją ir sužinoti, kurie žaidėjai jį pasirinko kaip taikinį šią naktį",
					jailor: "Gali pasirinkti žaidėją ir užblokuoti jo veiksmus kitą ciklą, įskaitant balsavimą",
					priest: "Gali pasirinkti žaidėją ir apsaugoti jį nuo eliminacijos šią naktį; jei į jį buvo nukreiptas eliminavimo veiksmas, apie tai sužinoma",
					serialKiller: "Gali eliminuoti pasirinktą žaidėją kiekvieną naktį; laimi, kai eliminuoja pusę visų žaidėjų",
					chronicler: "Kiekvieną naktį gauna atsitiktinį neatspėtą vaidmenį ir gali nurodyti, kuris žaidėjas jį turi. Teisingai atspėjęs ketvirtadalį visų vaidmenų laimi."
				}
			},
			results: {
				phaseTitle: "{phase} rezultatai",
				personalTitle: "{phase} rezultatas",
				dayEnded: "Dienos diskusija baigėsi",
				votingNoElimination: "Balsavimas baigėsi be eliminavimo",
				votingEliminated: "Balsavimu eliminuota: {players}",
				nightPeaceful: "Naktis baigėsi ramiai",
				nightEliminated: "Naktį eliminuota: {players}",
				votesRecorded: "Įrašyta balsų: {count}",
				votes: "Balsai",
				personal: "Asmeniniai rezultatai",
				eliminated: "Eliminuoti",
				anonymousVoter: "Anonimas",
				voteSkipped: "praleido",
				voteTarget: "balsavo už {target}"
			},
			personal: {
				eliminate: "Atakavote {player}",
				convert: "Pavertėte {player}",
				inspect: "{player} atrodo {alignment}",
				watchVisitors: "{player} aplankė {visitors}",
				watchNone: "{player} niekas neaplankė",
				jailApplied: "{player} buvo įkalintas",
				jailFailed: "Įkalinti {player} nepavyko",
				jailed: "Buvote įkalintas",
				protectSaved: "Jūsų apsauga išgelbėjo {player}",
				protectQuiet: "{player} nebuvo atakuotas",
				guessCorrect: "Teisingai: {player} turėjo vaidmenį {role}",
				guessIncorrect: "Neteisingai: {player} neturėjo vaidmens {role}",
				chroniclerTarget: "Kitas Metraštininko taikinio vaidmuo yra {role}",
				converted: "Buvote paverstas vampyru"
			},
			finished: {
				title: "Žaidimo rezultatai",
				vampires: "Vampyrai",
				winnerMessage: "{winner} laimėjo žaidimą",
				winners: "Laimėtojai: {winners}",
				endedOnDay: "Žaidimas baigėsi {day} dieną",
				finalRoles: "Galutiniai vaidmenys",
				timeline: "Veiksmų eiga",
				columns: {
					day: "Diena",
					phase: "Fazė",
					player: "Žaidėjas",
					role: "Vaidmuo",
					status: "Būsena",
					action: "Veiksmas",
					target: "Taikinys"
				},
				status: {
					alive: "Gyvas",
					eliminated: "Eliminuotas"
				}
			},
			roles: {
				commoner: "Narys",
				visionary: "Regėtojas",
				vigilante: "Budelis",
				watchman: "Sargas",
				jailor: "Prižiūrėtojas",
				priest: "Kunigas",
				jester: "Juokdarys",
				serialKiller: "Serijinis žudikas",
				chronicler: "Metraštininkas"
			}
		}
	},
	errors: {
		specific: {
			[ErrorCode.MISSING_FIELDS]: "Laukas {field} yra privalomas",
			[ErrorCode.INVALID_TYPE]: "Lauko {field} tipas netinkamas",
			[ErrorCode.VALUE_EXISTS]: "Reikšmė {field} jau egzistuoja",
			[ErrorCode.INVALID_TOO_SHORT]: "Laukas {field} per trumpas",
			[ErrorCode.INVALID_TOO_LONG]: "Laukas {field} per ilgas",
			[ErrorCode.INVALID_EMAIL]: "Laukas {field} nėra tinkamas el. paštas",
		},
		generic: {
			[ErrorCode.INVALID_REQUEST]: "Netinkama užklausa",
			[ErrorCode.UNKNOWN_ERROR]: "Įvyko nežinoma klaida",
			[ErrorCode.NETWORK_ERROR]: "Tinklo klaida. Patikrinkite ryšį",
			[ErrorCode.MISSING_FIELDS]: "Trūksta privalomų laukų",
			[ErrorCode.INVALID_TYPE]: "Netinkamas duomenų tipas",
			[ErrorCode.VALUE_EXISTS]: "Ši reikšmė jau egzistuoja",
			[ErrorCode.EXPIRED_TOKEN]: "Sesija baigėsi. Prisijunkite iš naujo",
			[ErrorCode.INVALID_CREDENTIALS]: "Netinkamas prisijungimo vardas arba slaptažodis",
			[ErrorCode.UNAUTHORIZED]: "Neturite teisės atlikti šio veiksmo",
			[ErrorCode.INVALID_TOO_SHORT]: "Reikšmė per trumpa",
			[ErrorCode.INVALID_TOO_LONG]: "Reikšmė per ilga",
			[ErrorCode.INVALID_EMAIL]: "Netinkamas el. pašto adresas",
			[ErrorCode.MISSING_REFRESH_TOKEN]: "Sesija baigėsi. Prisijunkite iš naujo",
			[ErrorCode.INTERNAL_ERROR]: "Serverio klaida. Bandykite vėliau",
			[ErrorCode.RATE_LIMIT_EXCEEDED]: "Per daug užklausų. Sulėtinkite veiksmus",
			[ErrorCode.INVALID_ICON]: "Netinkama ikona",
			[ErrorCode.TOO_LARGE]: "Įkeliamas failas per didelis",
			[ErrorCode.PLAYER_NOT_IN_LOBBY]: "Nesate laukiamajame",
			[ErrorCode.GAME_NOT_FOUND]: "Žaidimas nerastas",
			[ErrorCode.INVALID_GAME_CODE]: "Netinkamas žaidimo kodas",
			[ErrorCode.GAME_NOT_IN_LOBBY]: "Žaidimas jau prasidėjo arba nebepasiekiamas",
			[ErrorCode.GAME_ALREADY_STARTED]: "Žaidimas jau prasidėjo",
			[ErrorCode.GAME_FULL]: "Žaidimas pilnas",
			[ErrorCode.NOT_GAME_LEADER]: "Nesate žaidimo vadovas",
			[ErrorCode.LOBBY_TOO_SMALL]: "Laukia per mažai žaidėjų pradžiai",
			[ErrorCode.GAME_NOT_CREATED]: "Nepavyko sukurti žaidimo",
			[ErrorCode.ALREADY_IN_GAME]: "Jau esate žaidime",
			[ErrorCode.INVALID_SEAT]: "Netinkama vieta",
			[ErrorCode.SEAT_TAKEN]: "Ši vieta jau užimta",
			[ErrorCode.INVALID_ACTION]: "Šis veiksmas dabar negalimas",
			[ErrorCode.PLAYER_ELIMINATED]: "Eliminuoti žaidėjai negali to daryti",
			[ErrorCode.CHAT_NOT_ALLOWED]: "Šioje fazėje pokalbis negalimas",
			[ErrorCode.USER_NOT_FOUND]: "Naudotojas nerastas",
			[ErrorCode.FRIENDSHIP_ALREADY_EXISTS]: "Draugystė jau egzistuoja",
			[ErrorCode.FRIENDSHIP_ALREADY_SENT]: "Draugystės užklausa jau išsiųsta",
			[ErrorCode.FRIEND_REQUEST_EXISTS]: "Draugystės užklausa jau egzistuoja",
			[ErrorCode.FRIENDSHIP_NOT_FOUND]: "Draugystė nerasta",
			[ErrorCode.USER_BLOCKED]: "Naudotojas užblokuotas",
			[ErrorCode.BOT_NOT_ADDED]: "Nepavyko pridėti boto",
			[ErrorCode.USER_NOT_FRIEND]: "Naudotojas nėra jūsų draugas",
			[ErrorCode.FRIENDS_LIMIT_REACHED]: "Pasiektas draugų limitas",
			[ErrorCode.FRIEND_REQUEST_OUTGOING_LIMIT_REACHED]: "Pasiektas siunčiamų užklausų limitas",
			[ErrorCode.FRIEND_REQUEST_INCOMING_LIMIT_REACHED]: "Pasiektas gaunamų užklausų limitas",
			[ErrorCode.TOO_SOON]: "Palaukite prieš bandydami dar kartą",
		},
	},
	components: {
		sidebar: {
			menu: "Meniu",
			chat: "Pokalbis",
			settings: {
				header: "Nustatymai",
				languages: "Kalba",
				themes: "Temos",
				colorThemes: "Spalvų temos",
				icon: "Ikona",
				iconPicker: "Įkelti ikoną (leidžiama .png, .jpg, .jpeg, .gif, .webp)",
				languageSelect: {
					english: "Anglų",
					lithuanian: "Lietuvių",
				},
				themeSelect: {
					light: "Šviesi",
					dark: "Tamsi",
					dynamic: "Dinaminė"
				},
				colorThemeSelect: {
					red: "Raudona",
					blue: "Mėlyna",
					purple: "Violetinė",
					gold: "Auksinė",
				},
				iconUpload: {
					invalidType: "Netinkamas failo tipas. Leidžiami tik .png, .jpg, .jpeg, .gif, .webp.",
					readFailed: "Nepavyko perskaityti failo",
				},
				saveSuccessMessage: "Nustatymai išsaugoti",
			},
			chats: "Pokalbiai",
			friends: "Draugai",
			notes: {
				header: "Užrašai",
			},
			direct: "Asmeniniai",
			game: "Žaidimo"
		},
		popups: {
			joinGame: {
				title: "Prisijungti prie žaidimo",
				gameCode: "Įveskite žaidimo kodą",
				join: "Prisijungti",
				accept: "Priimti",
				loadingMessage: "Jungiamasi prie žaidimo...",
				inviteMessage: "{username} jus pakvietė",
				defaultUsername: "Žaidėjas"
			},
			startingTimeout: {
				title: "Žaidimas prasideda",
				message: "Prasideda po {seconds} s..."
			}
		}
	},
	friends: {
		search: {
			placeholder: "Ieškoti draugų...",
			friendsFilter: "Filtruoti draugus..."
		},
		sendRequest: "Siųsti draugystės užklausą",
		receivedRequests: "Gautos užklausos iš:",
		pendingRequests: "Išsiųsti",
		accept: "Priimti",
		reject: "Atmesti",
		cancel: "Atšaukti",
		cancelRequest: "Atšaukti užklausą",
		noFriends: "Nieko nerasta",
		startChat: "Pradėti pokalbį",
		actions: {
			chat: "Pokalbis",
			inviteToGame: "Pakviesti į žaidimą",
			unfriend: "Pašalinti draugą",
			block: "Blokuoti",
			unblock: "Atblokuoti",
		},
		blockedUsers: {
			showBlockedUsers: "Užblokuoti",
		},
		confirm: {
			unfriendTitle: "Pašalinti draugą",
			unfriendMessage: "Pašalinti {username} iš draugų?",
			blockTitle: "Blokuoti naudotoją",
			blockMessage: "Blokuoti {username}?",
			cancelRequestTitle: "Atšaukti draugystės užklausą",
			cancelRequestMessage: "Atšaukti draugystės užklausą naudotojui {username}?",
			unblockTitle: "Atblokuoti naudotoją",
			unblockMessage: "Atblokuoti {username}?"
		},
		success: {
			friendRequestReceived: "Gauta draugystės užklausa",
			friendRequestReceivedMessage: "Gavote draugystės užklausą iš {username}",
			friendRequestSent: "Draugystės užklausa išsiųsta",
			friendRequestSentMessage: "Draugystės užklausa išsiųsta naudotojui {username}",
			friendRequestCancelled: "Draugystės užklausa atšaukta",
			friendRequestCancelledMessage: "Draugystės užklausa sėkmingai atšaukta",
			friendRequestAccepted: "Draugystės užklausa priimta",
			friendRequestAcceptedMessage: "Dabar esate draugai su {username}",
			friendRequestRejected: "Draugystės užklausa atmesta",
			friendRequestRejectedMessage: "Draugystės užklausa sėkmingai atmesta",
			friendRemoved: "Draugas pašalintas",
			friendRemovedMessage: "Draugas sėkmingai pašalintas",
			userBlocked: "Naudotojas užblokuotas",
			userBlockedMessage: "{username} užblokuotas",
			userUnblocked: "Naudotojas atblokuotas",
			userUnblockedMessage: "Naudotojas sėkmingai atblokuotas",
			inviteSent: "Kvietimas išsiųstas",
			inviteSentMessage: "Žaidimo kvietimas sėkmingai išsiųstas"
		},
		error: {
			fetchFriends: "Nepavyko gauti draugų",
			fetchPendingRequests: "Nepavyko gauti laukiančių užklausų",
			fetchSentRequests: "Nepavyko gauti išsiųstų užklausų",
			fetchBlockedUsers: "Nepavyko gauti užblokuotų naudotojų"
		}
	},
	chat: {
		back: "Grįžti į pokalbių sąrašą",
		game: "Žaidimas",
		openInPopup: "Atidaryti lange",
		noMessages: "Žinučių dar nėra. Pradėkite pokalbį!",
		beginning: "Pokalbio pradžia",
		typeMessage: "Rašykite žinutę...",
		send: "Siųsti",
		messageDeleted: "[žinutė ištrinta]",
		lockedInput: "Pokalbis dabar užrakintas",
		actions: {
			edit: "Redaguoti žinutę",
			delete: "Ištrinti žinutę"
		},
		delete: {
			confirmTitle: "Ištrinti žinutę",
			confirmMessage: "Ar tikrai norite ištrinti šią žinutę?"
		}
	},
	notes: {
		empty: "Nieko nerasta",
		search: {
			placeholder: "Filtruoti užrašus..."
		},
		fields: {
			title: "Pavadinimas",
			content: "Turinys"
		},
		error: {
			fetchNotes: "Nepavyko gauti užrašų"
		},
		validation: {
			titleRequired: "Pavadinimas privalomas",
			contentRequired: "Turinys privalomas"
		},
		actions: {
			new: "Naujas užrašas",
			refresh: "Atnaujinti",
			edit: "Redaguoti",
			delete: "Ištrinti"
		},
		create: {
			success: "Užrašas sukurtas",
			error: "Nepavyko sukurti užrašo",
			confirmTitle: "Sukurti užrašą",
			confirmMessage: "Sukurti šį užrašą?"
		},
		edit: {
			success: "Užrašas atnaujintas",
			error: "Nepavyko atnaujinti užrašo",
			confirmTitle: "Išsaugoti užrašą",
			confirmMessage: "Išsaugoti užrašo pakeitimus?"
		},
		cancel: {
			confirmTitle: "Atmesti pakeitimus",
			confirmMessage: "Atmesti jūsų pakeitimus?"
		},
		delete: {
			success: "Užrašas ištrintas",
			error: "Nepavyko ištrinti užrašo",
			confirmTitle: "Ištrinti užrašą",
			confirmMessage: "Ištrinti užrašą \"{title}\"?"
		},
		popup: {
			createTitle: "Sukurti užrašą",
			viewTitle: "Peržiūrėti užrašą",
			unsavedTitle: "Neišsaugoti pakeitimai"
		},
		messages: {
			validation: "Pavadinimas ir turinys privalomi",
			saveSuccess: "Užrašas išsaugotas",
			saveError: "Nepavyko išsaugoti užrašo",
			deleteSuccess: "Užrašas ištrintas",
			deleteError: "Nepavyko ištrinti užrašo",
			unsaved: "Turite neišsaugotų pakeitimų. Išsaugokite arba atmeskite prieš uždarydami."
		}
	},
	roles: {
		powerLevel: "Galios lygis",
		keys: {
			vampire: "Vampyras",
			count: "Grafas",
			bloodBank: "Kraujo bankas",
			bloodbank: "Kraujo bankas",
			commoner: "Narys",
			visionary: "Regėtojas",
			vigilante: "Budelis",
			watchman: "Sargas",
			jailor: "Prižiūrėtojas",
			priest: "Kunigas",
			jester: "Juokdarys",
			serialKiller: "Serijinis žudikas",
			chronicler: "Metraštininkas"
		},
		descriptions: {
			vampire: "Gali eliminuoti pasirinktą žaidėją kas antrą naktį; jei per tris ciklus neatlieka eliminacijos, miršta.",
			bloodBank: "Gali eliminuoti pasirinktą žaidėją kas antrą naktį; kol yra gyvas, kiti vampyrai gali neatlikti eliminacijos iki penkių ciklų.",
			bloodbank: "Gali eliminuoti pasirinktą žaidėją kas antrą naktį; kol yra gyvas, kiti vampyrai gali neatlikti eliminacijos iki penkių ciklų.",
			count: "Gali eliminuoti pasirinktą žaidėją kas antrą naktį; kartą per žaidimą gali paversti pasirinktą žaidėją vampyru.",
			commoner: "Neturi specialių gebėjimų.",
			visionary: "Gali pasirinkti žaidėją ir sužinoti jo frakciją (gera arba bloga). Gera frakcija yra bendruomenės, o bloga frakcija apima vampyrus ir neutralius.",
			vigilante: "Gali eliminuoti pasirinktą žaidėją; jei eliminuoja bendruomenės narį, pats miršta.",
			watchman: "Gali pasirinkti žaidėją ir sužinoti, kurie žaidėjai jį pasirinko kaip taikinį šią naktį.",
			jailor: "Gali pasirinkti žaidėją ir užblokuoti jo veiksmus kitą ciklą, įskaitant balsavimą.",
			priest: "Gali pasirinkti žaidėją ir apsaugoti jį nuo eliminacijos šią naktį; jei į jį buvo nukreiptas eliminavimo veiksmas, apie tai sužinoma.",
			jester: "Neturi specialių gebėjimų; laimi, jei yra eliminuojamas balsavimo metu.",
			serialKiller: "Gali eliminuoti pasirinktą žaidėją kiekvieną naktį; laimi, kai eliminuoja pusę visų žaidėjų.",
			chronicler: "Kiekvieną naktį gauna atsitiktinį neatspėtą vaidmenį ir gali nurodyti, kuris žaidėjas jį turi. Teisingai atspėjęs ketvirtadalį visų vaidmenų laimi."
		}
	},
} as const;
