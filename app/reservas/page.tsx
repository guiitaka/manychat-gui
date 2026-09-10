import Link from "next/link";
import Image from "next/image";
import { RESERVATION_MODELS, type ReservationModel } from "@/lib/types";
import { createReservation } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reserve o seu iPhone 18" };

const WHATSAPP_NUMBER = "5511979607922";

const SHORT_LABEL: Record<ReservationModel, string> = {
  "iPhone 18 Pro": "Pro",
  "iPhone 18 Pro Max": "Pro Max",
  "iPhone Duo": "Duo",
};

export default async function Reservas({
  searchParams,
}: {
  searchParams: Promise<{
    ok?: string;
    nome?: string;
    modelo?: string;
    erro?: string;
    name?: string;
    phone?: string;
    model?: string;
  }>;
}) {
  const sp = await searchParams;
  const success = sp.ok === "1";

  return (
    <main className="min-h-screen">
      <section className="relative overflow-hidden px-5 py-20 sm:py-28 text-center">
        <video
          className="hero-video absolute inset-0 h-full w-full object-cover"
          src="/reservas/hero-bg.mp4"
          poster="/reservas/hero-bg-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
        />
        <style>{`
          @media (prefers-reduced-motion: reduce) {
            .hero-video { display: none; }
          }
        `}</style>
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 20%, rgba(225,48,108,0.45), transparent 60%), " +
              "radial-gradient(circle at 80% 60%, rgba(247,119,55,0.3), transparent 55%), " +
              "rgba(11,11,15,0.55)",
          }}
        />

        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)] mb-3">
            Reserva antecipada
          </p>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white">
            Reserve o seu
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, var(--color-brand), var(--color-brand-2))" }}
            >
              iPhone 18
            </span>
          </h1>
          <p className="mt-4 text-[var(--color-soft)] max-w-md mx-auto">
            Os novos iPhones acabaram de chegar. Garanta prioridade na fila assim que forem liberados.
          </p>

          <div className="mt-8 inline-block rounded-2xl bg-white p-3 shadow-2xl">
            <Image
              src="/reservas/duo-hero.jpg"
              alt="iPhone Duo aberto e fechado, lado a lado"
              width={675}
              height={900}
              priority
              className="rounded-xl max-h-64 w-auto"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-lg px-5 -mt-10 sm:-mt-14 pb-16 relative">
        {success ? (
          <SuccessCard nome={sp.nome || ""} modelo={sp.modelo || ""} />
        ) : (
          <form action={createReservation} className="card p-6 space-y-5">
            {sp.erro && (
              <p className="text-sm text-[var(--color-bad)]">{sp.erro}</p>
            )}

            <div>
              <label className="label" htmlFor="name">Nome completo</label>
              <input
                id="name"
                name="name"
                required
                defaultValue={sp.name}
                className="field"
                placeholder="Seu nome"
              />
            </div>

            <div>
              <label className="label" htmlFor="phone">WhatsApp</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                defaultValue={sp.phone}
                className="field"
                placeholder="(11) 99999-9999"
              />
            </div>

            <div>
              <span className="label">Modelo de interesse</span>
              <div className="grid grid-cols-3 gap-2">
                {RESERVATION_MODELS.map((m) => (
                  <label key={m} className="cursor-pointer">
                    <input
                      type="radio"
                      name="model"
                      value={m}
                      required
                      defaultChecked={sp.model === m}
                      className="peer sr-only"
                    />
                    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-4 text-center transition peer-checked:border-[var(--color-brand)] peer-checked:bg-[rgba(225,48,108,0.12)]">
                      <div className="text-xl mb-1" aria-hidden>📱</div>
                      <div className="text-[10px] text-[var(--color-muted)]">iPhone 18</div>
                      <div className="text-xs font-semibold leading-tight">{SHORT_LABEL[m]}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-full">Reservar agora</button>
          </form>
        )}

        <p className="hint text-center mt-6">
          <Link href="/privacidade" className="hover:underline">Política de privacidade</Link>
        </p>
      </div>
    </main>
  );
}

function SuccessCard({ nome, modelo }: { nome: string; modelo: string }) {
  const text = encodeURIComponent(`Olá! Acabei de reservar o ${modelo} pela página de reservas.`);
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;

  return (
    <div className="card p-6 text-center">
      <div className="text-3xl mb-2" aria-hidden>🎉</div>
      <h2 className="text-lg font-semibold">Reserva confirmada{nome ? `, ${nome}` : ""}!</h2>
      <p className="hint !mt-2">
        Você entrou na lista para o <strong className="text-white">{modelo}</strong>. Vamos avisar assim
        que chegar a sua vez.
      </p>
      <a href={whatsappUrl} target="_blank" rel="noreferrer" className="btn btn-primary w-full mt-5">
        Falar no WhatsApp
      </a>
      <Link href="/reservas" className="hint block mt-3 hover:underline">
        Fazer outra reserva
      </Link>
    </div>
  );
}
