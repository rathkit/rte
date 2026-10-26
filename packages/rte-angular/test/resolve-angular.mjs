export async function resolve(specifier, context, next) {
  if (specifier === "@angular/core") return { url: new URL("./angular-stub.ts", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
