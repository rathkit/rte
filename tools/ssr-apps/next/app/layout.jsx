export const metadata = { title: "Server rendering with Next.js" };

export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
