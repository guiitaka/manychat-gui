import Link from "next/link";

export default function ExclusaoDeDadosConteudo() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="text-2xl font-semibold tracking-tight">Exclusão de dados</h1>
      <p className="hint">Como pedir a remoção completa das suas informações.</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--color-soft)]">
        <section>
          <h2 className="text-base font-semibold text-white mb-2">O que é apagado</h2>
          <p>
            Seu identificador do Instagram, seu nome de usuário, o texto dos seus comentários e
            mensagens registrados por esta aplicação, e todo o histórico de envios relacionado a você.
            A remoção é definitiva e não há backup separado desses registros.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">Como pedir</h2>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>
              Envie um e-mail para{" "}
              <a href="mailto:guitaka123@icloud.com" className="text-[var(--color-brand)] hover:underline">guitaka123@icloud.com</a>{" "}
              com o assunto <strong>“Exclusão de dados”</strong>.
            </li>
            <li>Informe o seu @ do Instagram (é o suficiente para localizarmos os registros).</li>
            <li>A exclusão é feita em até 7 dias corridos e você recebe uma confirmação por e-mail.</li>
          </ol>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">Como parar de receber mensagens</h2>
          <p>
            A qualquer momento você pode bloquear ou silenciar o perfil pelo próprio Instagram, ou
            simplesmente responder pedindo para não receber mais — nenhuma nova mensagem automática
            será enviada.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">Revogar o acesso do app</h2>
          <p>
            Se você é o titular da conta conectada, remova o acesso em Instagram → Configurações →
            Apps e sites. Isso invalida o token imediatamente.
          </p>
        </section>

        <p className="pt-2">
          <Link href="/privacidade" className="text-[var(--color-brand)] hover:underline">← Política de privacidade</Link>
        </p>
      </div>
    </main>
  );
}
