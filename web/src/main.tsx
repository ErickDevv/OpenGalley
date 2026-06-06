import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import "./monacoSetup";
import Dashboard from "./pages/Dashboard";
import Editor from "./pages/Editor";

const router = createBrowserRouter([
  { path: "/", element: <Dashboard /> },
  { path: "/p/:id", element: <Editor /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
