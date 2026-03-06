import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./css/fontCinzel.css"
import "./css/global.css"
import "./css/themes.css"
import App from "./app.tsx"

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<div className="app-container">
			<div className="background" />
			<App />
		</div>
	</StrictMode>,
)