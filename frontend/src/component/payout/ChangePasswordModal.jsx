import { useState } from "react";
import { X, KeyRound, Check } from "lucide-react";
import api from "../../lib/payoutApi.js";

const inputCls =
  "w-full rounded-xl bg-white border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition";

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    setSaving(true);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm px-4">
      <form
        onSubmit={submit}
        className="bg-white border border-zinc-200 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-zinc-400" /> Change password
          </h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <p className="text-sm text-emerald-700 font-medium py-4 text-center flex items-center justify-center gap-1.5">
            <Check className="w-4 h-4" /> Password changed
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <label htmlFor="pw-current" className="block text-sm text-zinc-600">Current password</label>
              <input
                id="pw-current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputCls}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="pw-new" className="block text-sm text-zinc-600">New password (min 8 chars)</label>
              <input
                id="pw-new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputCls}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="pw-confirm" className="block text-sm text-zinc-600">Confirm new password</label>
              <input
                id="pw-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={inputCls}
                minLength={8}
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
              disabled={saving}
              className="w-full bg-ink-950 hover:bg-ink-800 active:scale-[0.98] disabled:opacity-60 text-white font-medium rounded-xl px-4 py-2.5 text-sm transition"
            >
              {saving ? "Saving..." : "Update password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
