export default function Toast({ show, kind = "success", message }) {
  if (!show) return null;
  const color = kind === "error" ? "bg-red-600" : "bg-emerald-600";
  return (
    <div
      role="alert"
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 ${color} text-white px-4 py-2 rounded-xl shadow-lg transition`}
    >
      {message}
    </div>
  );
}
