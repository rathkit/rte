export async function resolve(specifier, context, next) {
  if (specifier === "react") return { url: new URL("./react-stub.ts", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
