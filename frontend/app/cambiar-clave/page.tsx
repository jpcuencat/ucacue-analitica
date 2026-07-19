import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPasswordChangeToken, PWC_COOKIE_NAME } from "@/lib/auth";
import { changePasswordAction } from "./action";

const ERRORES: Record<string, string> = {
  actual: "La contraseña actual no es correcta.",
  confirmacion: "La nueva contraseña y su confirmación no coinciden.",
  corta: "La nueva contraseña debe tener al menos 10 caracteres.",
  debil: "Debe incluir mayúsculas, minúsculas y números.",
  igual: "La nueva contraseña no puede ser igual a la actual.",
};

type Props = { searchParams: Promise<{ error?: string; from?: string }> };

export default async function CambiarClavePage({ searchParams }: Props) {
  const { error, from = "/" } = await searchParams;

  // Sin token de propósito válido no hay nada que hacer aquí.
  const jar = await cookies();
  const token = jar.get(PWC_COOKIE_NAME)?.value;
  const email = token ? await verifyPasswordChangeToken(token) : null;
  if (!email) {
    redirect(`/login?from=${encodeURIComponent(from.startsWith("/") ? from : "/")}`);
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-card__logo">
          <span className="login-card__logo-text">UCACUE</span>
          <span className="login-card__logo-sub">Asistente Analítico</span>
        </div>
        <h1 className="login-card__title">Cambia tu contraseña</h1>
        <p className="login-card__hint">
          Por seguridad, en tu primer acceso debes reemplazar la contraseña
          inicial. Sesión: <strong>{email}</strong>
        </p>

        {error && (
          <p className="login-card__error">
            {ERRORES[error] ?? "No se pudo cambiar la contraseña."}
          </p>
        )}

        <form action={changePasswordAction}>
          <input type="hidden" name="from" value={from} />

          <div className="login-field">
            <label htmlFor="current" className="login-field__label">
              Contraseña actual
            </label>
            <input
              id="current"
              name="current"
              type="password"
              autoComplete="current-password"
              required
              className="login-field__input"
            />
          </div>

          <div className="login-field">
            <label htmlFor="nueva" className="login-field__label">
              Nueva contraseña
            </label>
            <input
              id="nueva"
              name="nueva"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              className="login-field__input"
            />
            <span className="login-field__help">
              Mínimo 10 caracteres, con mayúsculas, minúsculas y números.
            </span>
          </div>

          <div className="login-field">
            <label htmlFor="confirmar" className="login-field__label">
              Confirmar nueva contraseña
            </label>
            <input
              id="confirmar"
              name="confirmar"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              className="login-field__input"
            />
          </div>

          <button type="submit" className="btn btn--primary btn--full">
            Cambiar contraseña
          </button>
        </form>
      </div>
    </div>
  );
}
