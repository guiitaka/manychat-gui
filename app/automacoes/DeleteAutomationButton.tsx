"use client";

import { deleteAutomation } from "../actions";

export default function DeleteAutomationButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteAutomation}
      onSubmit={(e) => {
        if (!confirm(`Excluir a automação "${name}"? Essa ação não pode ser desfeita.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-danger" type="submit">Excluir</button>
    </form>
  );
}
