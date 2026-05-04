import Popup from "./Popup";
import { Chat } from "../sidebar/Chats";
import type { PopupData } from "../../types/popup";

type Props = {
	popup: PopupData<"chat">;
	onClose: () => void;
};

const ChatPopup = ({ popup, onClose }: Props) => {

	const handleMessageSent = () => {
		// Sidebar previews are updated by Base through WebSocket events
	};

	const handleOpenPopup = () => {
		// Prevent opening popups from popups to avoid complexity
	};

	return (
		<Popup
			id={popup.id}
			onClose={onClose}
			title={popup.title || popup.payload.chatName}
			position="center"
			width={500}
			height={600}
			minimizable={true}
			closable={true}
		>
			<div className="popup-chat-container">
				<Chat
					chatId={popup.payload.chatId}
					chatName={popup.payload.chatName}
					chatType={popup.payload.chatType}
					directChatId={popup.payload.directChatId ?? null}
					gameStatus={popup.payload.gameStatus}
					onBack={() => {}}
					onMessageSent={handleMessageSent}
					onOpenPopup={handleOpenPopup}
				/>
			</div>
		</Popup>
	);
};

export default ChatPopup;
