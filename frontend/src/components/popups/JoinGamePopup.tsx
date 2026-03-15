import Popup from "./Popup";
import { useRef, useState } from "react";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import type { PopupData } from "../../types/popup";
import { useTranslation } from "../../hooks/useTranslation";
import { useNavigate } from "react-router-dom";
import { useWebSocketNotifyWithLoading } from "../../hooks/useWebSocketNotifyWithLoading";
import { ErrorCode } from "../../types";
import "../../css/Home.css";

type Props = {
	popup: PopupData<"joinGame">;
	onClose: () => void;
};

const JoinGamePopup = ({ popup, onClose }: Props) => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { notifyWithLoading } = useWebSocketNotifyWithLoading();

	const [gameCode, setGameCode] = useState("");
	const [cursorPosition, setCursorPosition] = useState(0);
	const [isFocused, setIsFocused] = useState(false);
	const [isJoining, setIsJoining] = useState(false);

	const inputRef = useRef<HTMLInputElement>(null);
	const joiningLockRef = useRef(false);

	const handleSubmit = () => {
		const formatted = gameCode.trim().toUpperCase();
		if (formatted.length !== 6) return;
		if (isJoining) return;

		setIsJoining(true);

		notifyWithLoading(
			{ type: "JOIN_GAME", gameCode: formatted },
			{
				successOn: (msg) => msg.type === "JOIN_GAME_OK",
				rejectOn: (msg) =>
					msg.type === "ERROR" &&
					(
						msg.code === ErrorCode.GAME_NOT_FOUND ||
						msg.code === ErrorCode.ALREADY_IN_GAME ||
						msg.code === ErrorCode.GAME_ALREADY_STARTED ||
						msg.code === ErrorCode.GAME_FULL
					),
				onSuccess: (msg) => {
					setIsJoining(false);

					if (msg.type === "JOIN_GAME_OK") {
						onClose();
						navigate(`/game-lobby/${msg.gameCode}`, { replace: true });
					}
				},
				onReject: () => {
					setIsJoining(false);
				},
				onTimeout: () => {
					setIsJoining(false);
				}
			},
			joiningLockRef
		);
	};

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (isJoining) return;

		const newValue = e.target.value.toUpperCase();
		setGameCode(newValue);

		const position = e.target.selectionStart ?? newValue.length;
		setCursorPosition(position);

		requestAnimationFrame(() => {
			inputRef.current?.setSelectionRange(position, position);
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (isJoining) return;

		const inputElement = inputRef.current;
		if (!inputElement) return;

		const start = inputElement.selectionStart ?? 0;
		const end = inputElement.selectionEnd ?? start;

		if (e.key === "Backspace") {
			e.preventDefault();

			let delFrom = start;
			let delTo = end;

			if (start === end) {
				delFrom = Math.max(0, start - 1);
			}

			const next = gameCode.substring(0, delFrom) + gameCode.substring(delTo);

			setGameCode(next);
			setCursorPosition(delFrom);

			requestAnimationFrame(() => inputElement.setSelectionRange(delFrom, delFrom));
			return;
		}

		if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
			requestAnimationFrame(() => {
				const position = inputElement.selectionStart ?? 0;
				setCursorPosition(position);
			});
		}

		if (e.key === "Enter") {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleClick = (index: number) => {
		if (isJoining) return;

		const input = inputRef.current;
		if (!input) return;

		const position = Math.min(index, gameCode.length);
		setCursorPosition(position);

		input.focus();
		requestAnimationFrame(() => input.setSelectionRange(position, position));
	};

	return (
		<Popup
			id={popup.id}
			onClose={() => {
				if (isJoining) return;
				onClose();
			}}
			closing={popup.closing}
			title={popup.title}
			position={popup.position ?? "center"}
			width={popup.width ?? 300}
			height={popup.height ?? 200}
			minimizable={!isJoining}
			closable={!isJoining}
			icon={<UserGroupIcon/>}
		>
			<div className="popup-content-center-flex">
				<h2>{t("components.popups.joinGame.gameCode")}</h2>

				<div className="code-display" onClick={() => inputRef.current?.focus()}>
					{Array.from({ length: 6 }).map((_, i) => (
						<span
							key={i}
							className={`code-char ${isFocused && i === cursorPosition ? "active" : ""}`}
							onClick={() => handleClick(i)}
						>
							{gameCode[i] || ""}
						</span>
					))}

					<input
						ref={inputRef}
						type="text"
						maxLength={6}
						value={gameCode}
						onChange={handleInputChange}
						onKeyDown={handleKeyDown}
						onFocus={() => setIsFocused(true)}
						onBlur={() => setIsFocused(false)}
						className="code-input-hidden"
						disabled={isJoining}
					/>
				</div>

				<button
					className="custom-button"
					onClick={handleSubmit}
					disabled={gameCode.trim().length !== 6 || isJoining}
				>
					{isJoining ? t("common.loading") : t("components.popups.joinGame.join")}
				</button>
			</div>
		</Popup>
	);
};

export default JoinGamePopup;