import Link from "next/link";

export const metadata = { title: "Política de Privacidade" };

export default function Privacidade() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-14">
      <h1 className="text-2xl font-semibold tracking-tight">Política de Privacidade</h1>
      <p className="hint">Última atualização: 30 de agosto de 2026.</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--color-soft)]">
        <section>
          <h2 className="text-base font-semibold text-white mb-2">1. Quem somos</h2>
          <p>
            Este aplicativo é uma ferramenta pessoal de atendimento automatizado usada por um único
            titular de conta do Instagram para responder comentários e mensagens recebidas no próprio
            perfil. Não é um serviço aberto ao público e não há cadastro de terceiros.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">2. Quais dados tratamos</h2>
          <p>Quando você comenta em uma publicação ou envia uma mensagem para o perfil, recebemos da API do Instagram:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>seu identificador numérico do Instagram (ID) e, quando disponível, seu nome de usuário;</li>
            <li>o texto do comentário ou da mensagem enviada;</li>
            <li>o identificador da publicação comentada e o identificador do comentário;</li>
            <li>a data e a hora da interação.</li>
          </ul>
          <p className="mt-2">
            Não coletamos e-mail, telefone, endereço, dados de pagamento, localização, lista de
            seguidores nem qualquer conteúdo privado do seu perfil.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">3. Para que usamos</h2>
          <p>
            Exclusivamente para enviar a você a resposta automática que você solicitou ao comentar ou
            escrever, e para registrar o histórico dessa conversa. Não vendemos, alugamos, cedemos nem
            compartilhamos esses dados com terceiros, e não os usamos para publicidade.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">4. Onde ficam armazenados</h2>
          <p>
            Em um banco de dados PostgreSQL hospedado na Supabase, com acesso restrito ao servidor da
            aplicação. A aplicação é hospedada na Vercel. Nenhum dado é acessível publicamente.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">5. Por quanto tempo</h2>
          <p>
            Registros de interação são mantidos enquanto forem úteis ao atendimento e removidos a
            qualquer momento mediante solicitação. Ao desconectar a conta do Instagram, o token de
            acesso é apagado imediatamente.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">6. Seus direitos</h2>
          <p>
            Conforme a LGPD (Lei 13.709/2018), você pode solicitar a confirmação do tratamento, o
            acesso, a correção, a portabilidade ou a exclusão dos seus dados. Basta pedir pelo canal
            abaixo — veja também a página de{" "}
            <Link href="/exclusao-de-dados" className="text-[var(--color-brand)] hover:underline">exclusão de dados</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-white mb-2">7. Contato</h2>
          <p>
            E-mail: <a href="mailto:guitaka123@icloud.com" className="text-[var(--color-brand)] hover:underline">guitaka123@icloud.com</a>
          </p>
        </section>
      </div>
    </main>
  );
}
