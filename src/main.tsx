import "@fontsource/ibm-plex-mono/300.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-sans/300.css";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { loadDatasets } from "./data";
import "./app/styles.css";

const registry = await loadDatasets();
createRoot(document.getElementById("root")!).render(<App registry={registry} />);
