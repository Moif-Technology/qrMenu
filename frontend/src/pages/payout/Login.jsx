import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { QrCode, ArrowRight } from "lucide-react";
import api, { storeSession } from "../../lib/payoutApi.js";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { username, password });
      storeSession(data.token, data.user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-xl bg-white border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition";

  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="rounded-xl bg-ink-950 p-2">
              <QrCode className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight text-zinc-900">DeynoQR</h1>
              <p className="text-xs text-zinc-500 leading-tight">Payout console</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="login-username" className="block text-sm text-zinc-600">
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputCls}
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="login-password" className="block text-sm text-zinc-600">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-ink-950 hover:bg-ink-800 active:scale-[0.98] disabled:opacity-60 text-white font-medium rounded-xl px-4 py-2.5 text-sm transition"
            >
              {loading ? "Signing in..." : "Sign in"}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </div>

      <p className="text-center text-xs text-zinc-400 pb-6">
        QR payment collections and restaurant settlements
      </p>
    </div>
  );
}
