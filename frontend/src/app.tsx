import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Home from "./pages/Home";
import { UserProvider, useUser } from "./contexts/UserContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import BaseLayout from "./components/Base";
import { PopupProvider } from "./contexts/PopupContext";
import PopupRenderer from "./components/popups/PopupRenderer";
import GameLobby from "./pages/GameLobby";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import WebSocketUiBridge from "./contexts/WebSocketUiBridge";

const ProtectedRoute = () => {
	const { user, authReady } = useUser();

	if (!authReady) return null;
	return user ? <Outlet /> : <Navigate to="/login" replace />;
};

const AuthenticatedLayout = () => (
	<WebSocketProvider>
		<PopupProvider>
			<PopupRenderer />
			<WebSocketUiBridge />
			<Outlet />
		</PopupProvider>
	</WebSocketProvider>
);

const App = () => {
	return (
		<Router>
			<UserProvider>
				<LanguageProvider>
					<ThemeProvider>
						<Routes>
							<Route path="/login" element={<Login />} />
							<Route path="/register" element={<Register />} />

							<Route element={<ProtectedRoute />}>
								<Route element={<AuthenticatedLayout />}>
									<Route element={<BaseLayout />}>
										<Route path="/home" element={<Home />} />
										<Route path="/game-lobby/:gameCode" element={<GameLobby />} />
									</Route>
								</Route>
							</Route>

							<Route path="*" element={<Navigate to="/login" replace />} />
						</Routes>
					</ThemeProvider>
				</LanguageProvider>
			</UserProvider>
		</Router>
	);
};

export default App;
