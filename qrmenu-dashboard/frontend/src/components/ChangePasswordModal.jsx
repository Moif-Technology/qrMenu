import { useState } from "react";
import { X, KeyRound } from "lucide-react";
import api from "../api.js";

export default function ChangePasswordModal({ onClose, dark = false }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const panel = dark
    ? "bg-slate-800 text-slate-100 border border-slate-700"
    : "bg-white text-gray-800";
  const input = dark
    ? "bg-slate-900 border-slate-700 text-slate-100 focus:ring-emerald-400"
    : "border-gray-200 focus:ring-emerald-500";
  const label = dark ? "text-slate-300" : "text-gray-600";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <form onSubmit={submit} className={`rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4 ${panel}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Change password
          </h3>
          <button type="button" onClick={onClose} className="opacity-50 hover:opacity-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {done ? (
          <p className="text-sm text-emerald-500 font-medium py-4 text-center">Password changed ✓</p>
        ) : (
          <>
            <div>
              <label className={`block text-sm font-medium mb-1 ${label}`}>Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${input}`}
                required
                autoFocus
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1 ${label}`}>New password (min 8 chars)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${input}`}
                minLength={8}
                required
              />
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1 ${label}`}>Confirm new password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${input}`}
                minLength={8}
                required
              />
            </div>

            {error && <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition"
            >
              {saving ? "Saving…" : "Update password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
