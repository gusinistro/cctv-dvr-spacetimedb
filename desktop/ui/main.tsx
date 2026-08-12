import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DesktopApp from "./DesktopApp";
import "./desktop.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode><DesktopApp /></StrictMode>,
);
