import { RenderMode, type ServerRoute } from "@angular/ssr";

// Rendered for each request, so the HTML a browser gets comes from a real server render.
export const serverRoutes: ServerRoute[] = [{ path: "**", renderMode: RenderMode.Server }];
