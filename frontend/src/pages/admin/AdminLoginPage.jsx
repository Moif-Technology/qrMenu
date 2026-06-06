import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Loader2, ArrowRight } from "lucide-react";
import { useAdminAuth } from "../../context/AdminAuthContext";

export default function AdminLoginPage() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from || "/admin/overview";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(loginId.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="admin-root min-h-screen grid lg:grid-cols-2">
      {/* Left — editorial ink panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden" style={{ background: "linear-gradient(160deg, #5E0017 0%, #7A0026 50%, #A81038 100%)" }}>
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-25"
          style={{ background: "radial-gradient(circle, #F4B9CA 0%, transparent 70%)" }}
        />
        <div className="relative">
          <p className="admin-eyebrow !text-[#F4B9CA]">Opaia · Hospitality</p>
        </div>
        <div className="relative">
          <h1 className="font-display text-[64px] leading-[0.95] text-[#FFF1F5]">
            Maître<span className="text-[#F4B9CA]">.</span>
          </h1>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-[#E3B6C4]">
            The reservation studio. Covers, timelines, and reports — composed
            with the care of a well-set table.
          </p>
        </div>
        <div className="relative flex items-center gap-3 text-[#D69EAE] text-xs tracking-wide">
          <span className="h-px w-10 bg-[#93324F]" />
          Private admin access
        </div>
      </div>

      {/* Right — form */}
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm admin-rise">
          <div className="lg:hidden mb-8">
            <p className="admin-eyebrow">Opaia</p>
            <h1 className="font-display text-5xl text-[var(--ink)] mt-1">Maître<span className="text-[var(--brass)]">.</span></h1>
          </div>

          <p className="admin-eyebrow">Welcome back</p>
          <h2 className="font-display text-[34px] leading-tight text-[var(--ink)] mt-1 mb-8">
            Sign in to continue
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[13px] font-semibold text-[var(--ink-soft)] mb-2">Staff login</label>
              <input
                type="text"
                autoFocus
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                className="w-full rounded-xl bg-[var(--paper)] border border-[var(--line)] px-4 py-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--brass)] focus:ring-2 focus:ring-[var(--brass-soft)] transition"
                placeholder="e.g. 101"
                required
              />
            </div>

            <div>
              <label className="block text-[13px] font-semibold text-[var(--ink-soft)] mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl bg-[var(--paper)] border border-[var(--line)] px-4 py-3 text-[15px] text-[var(--ink)] outline-none focus:border-[var(--brass)] focus:ring-2 focus:ring-[var(--brass-soft)] transition"
                placeholder="••••"
                required
              />
            </div>

            {error && (
              <div className="rounded-xl bg-[#F6E7E2] border border-[#E3C4BB] text-[var(--danger)] text-sm px-4 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="admin-btn-brass group w-full flex items-center justify-center gap-2 py-3.5 font-bold text-[15px] disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enter Studio
              {!submitting && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
            </button>
          </form>

          <p className="mt-8 text-xs text-[var(--ink-faint)]">Admin designation required · access is logged.</p>
        </div>
      </div>
    </div>
  );
}
