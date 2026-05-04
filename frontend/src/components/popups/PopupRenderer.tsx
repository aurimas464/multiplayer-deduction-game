import { usePopup } from "../../contexts/PopupContext";
import SuccessPopup from "./SuccessPopup";
import ErrorPopup from "./ErrorPopup";
import InfoPopup from "./InfoPopup";
import LoadingPopup from "./LoadingPopup";
import JoinGamePopup from "./JoinGamePopup";
import type { PopupData } from "../../types/popup";
import StartingTimeoutPopup from "./StartingTimeoutPopup";
import ChatPopup from "./ChatPopup";
import NotePopup from "./NotePopup";
import ConfirmPopup from "./ConfirmPopup";
import RoleRevealPopup from "./RoleRevealPopup";
import PlayerSelectionPopup from "./PlayerSelectionPopup";
import PhaseResultsPopup from "./PhaseResultsPopup";
import GameFinishedPopup from "./GameResultPopup";

type PopupFactoryProps = {
	popup: PopupData;
	onClose: () => void;
};

const PopupFactory = ({ popup, onClose }: PopupFactoryProps) => {
	switch (popup.type) {
		case "success":
			return <SuccessPopup popup={popup as PopupData<"success">} onClose={onClose} />;
		case "error":
			return <ErrorPopup popup={popup as PopupData<"error">} onClose={onClose} />;
		case "info":
			return <InfoPopup popup={popup as PopupData<"info">} onClose={onClose} />;
		case "loading":
			return <LoadingPopup popup={popup as PopupData<"loading">} onClose={onClose} />;
		case "confirm":
			return <ConfirmPopup popup={popup as PopupData<"confirm">} onClose={onClose} />;
		case "joinGame":
			return <JoinGamePopup popup={popup as PopupData<"joinGame">} onClose={onClose} />;
		case "startingTimeout":
			return <StartingTimeoutPopup popup={popup as PopupData<"startingTimeout">} onClose={onClose} />;
		case "chat": 
			return <ChatPopup popup={popup as PopupData<"chat">} onClose={onClose} />;
		case "note":
			return <NotePopup popup={popup as PopupData<"note">} onClose={onClose} />;
		case "roleReveal":
			return <RoleRevealPopup popup={popup as PopupData<"roleReveal">} onClose={onClose} />;
		case "playerSelection":
			return <PlayerSelectionPopup popup={popup as PopupData<"playerSelection">} onClose={onClose} />;
		case "phaseResults":
			return <PhaseResultsPopup popup={popup as PopupData<"phaseResults">} onClose={onClose} />;
		case "gameFinished":
			return <GameFinishedPopup popup={popup as PopupData<"gameFinished">} onClose={onClose} />;
		default:
			if (import.meta.env.VITE_ENV === "development") {
				console.log("Unknown popup");
			}
			return null;
	}
};

const PopupRenderer = () => {
	const { popups, closePopup } = usePopup();

	if (popups.length === 0) return null;

	return (
		<>
			{popups.map((popup) => (
				<PopupFactory
					key={popup.id}
					popup={popup}
					onClose={() => closePopup(popup.id)}
				/>
			))}
		</>
	);
};

export default PopupRenderer;
