export default function PublicProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <main className="container py-8">
      <div className="mx-auto grid max-w-4xl gap-12">
        {children}
      </div>
    </main>
  )
}
