import Surface from "./surface.jsx";

// A server component, rendered for each request (not prerendered), so the HTML a browser gets comes from a real server render.
export const dynamic = "force-dynamic";
// The client component below renders there once too, as the empty surface.
export default function Page() {
  return (
    <main>
      <h1>Next.js</h1>
      <Surface />
    </main>
  );
}
