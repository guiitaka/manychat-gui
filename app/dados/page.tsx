import Conteudo from "@/lib/ExclusaoDeDadosConteudo";

// Mesmo conteúdo de /exclusao-de-dados, em um path sem hifens:
// o validador do painel da Meta rejeita o path com hifens no campo
// "URL de instruções de exclusão de dados".
export const metadata = { title: "Exclusão de dados" };

export default function Dados() {
  return <Conteudo />;
}
