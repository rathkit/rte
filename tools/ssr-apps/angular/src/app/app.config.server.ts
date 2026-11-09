import { mergeApplicationConfig, type ApplicationConfig } from "@angular/core";
import { provideServerRendering, withRoutes } from "@angular/ssr";
import { config } from "./app.config";
import { serverRoutes } from "./app.routes.server";

export const serverConfig: ApplicationConfig = mergeApplicationConfig(config, {
  providers: [provideServerRendering(withRoutes(serverRoutes))],
});
