export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>; // Next 16: searchParams é assíncrono
}) {
  const { erro } = await searchParams;

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <form action="/api/login" method="post" className="card w-full max-w-sm p-7">
        <h1 className="text-lg font-semibold">Painel de automações</h1>
        <p className="hint mb-5">Entre com a senha do painel para continuar.</p>

        <label className="label" htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoFocus
          required
          className="field"
          placeholder="••••••••"
        />

        {erro && (
          <p className="mt-3 text-sm text-[var(--color-bad)]">Senha incorreta.</p>
        )}

        <button type="submit" className="btn btn-primary w-full mt-5">Entrar</button>
      </form>
    </main>
  );
}
