import { usePopup } from '../../contexts/PopupContext';
import SuccessPopup from './SuccessPopup';
import ErrorPopup from './ErrorPopup';
import LoadingPopup from './LoadingPopup';
import JoinGamePopup from './JoinGamePopup';
import type { PopupData } from '../../types/popup';


type PopupFactoryProps = {
	popup: PopupData;
	onClose: () => void;
};

const PopupFactory = ({ popup, onClose }: PopupFactoryProps) => {
	switch (popup.type) {
		case 'success':
			return <SuccessPopup popup={popup as PopupData<'success'>} onClose={onClose} />;
		case 'error':
			return <ErrorPopup popup={popup as PopupData<'error'>} onClose={onClose} />;
		case 'loading':
			return <LoadingPopup popup={popup as PopupData<'loading'>} onClose={onClose} />;
		case 'joinGame':
			return <JoinGamePopup popup={popup as PopupData<'joinGame'>} onClose={onClose} />;
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
			{popups.map(popup => (
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
