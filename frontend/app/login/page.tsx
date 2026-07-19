import { loginAction } from "./action";

type Props = { searchParams: Promise<{ error?: string; from?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { error, from = "/" } = await searchParams;

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-card__logo">
          <span className="login-card__logo-text">UCACUE</span>
          <span className="login-card__logo-sub">Asistente Analítico</span>
        </div>
        <h1 className="login-card__title">Iniciar sesión</h1>

        {error && (
          <p className="login-card__error">
            {error === "rate"
              ? "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo."
              : "Correo o contraseña incorrectos."}
          </p>
        )}

        <form action={loginAction}>
          <input type="hidden" name="from" value={from} />

          <div className="login-field">
            <label htmlFor="email" className="login-field__label">
              Correo institucional
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              required
              className="login-field__input"
              placeholder="nombre@ucacue.edu.ec"
            />
          </div>

          <div className="login-field">
            <label htmlFor="password" className="login-field__label">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="login-field__input"
            />
          </div>

          <button type="submit" className="btn btn--primary btn--full">
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
