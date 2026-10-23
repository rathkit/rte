export async function resolve(specifier, context, next) {
  if (specifier === "vue") return { url: new URL("./vue-stub.ts", import.meta.url).href, shortCircuit: true };
  return next(specifier, context);
}
