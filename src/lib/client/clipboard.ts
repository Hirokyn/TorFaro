function copyWithSelection(text: string) {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();

  const copied = document.execCommand("copy");
  field.remove();

  if (!copied) throw new Error("clipboard_unavailable");
}

// writeText pode existir e ainda assim ser recusado pela política de permissões do navegador.
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    copyWithSelection(text);
  }
}
