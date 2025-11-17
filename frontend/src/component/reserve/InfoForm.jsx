

// ─────────────────────────────────────────────────────────────────────────────
// File: src/components/reserve/InfoForm.jsx
// ─────────────────────────────────────────────────────────────────────────────
function Input({ label, placeholder, type = "text", value, onChange }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-gray-600">{label}</div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] outline-none placeholder:text-gray-400 focus:border-gray-300"
      />
    </label>
  );
}

function Select({ label, value, onChange, placeholder, children }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-gray-600">{label}</div>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] outline-none focus:border-gray-300"
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {children}
        </select>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </label>
  );
}

function TextArea({ label, placeholder, value, onChange }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm text-gray-600">{label}</div>
      <textarea
        rows={4}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-[15px] outline-none placeholder:text-gray-400 focus:border-gray-300"
      />
    </label>
  );
}

export default function InfoForm({ value, onChange }) {
  return (
    <div className="space-y-4">
      <Input label="Full name" placeholder="Your full name" value={value.name} onChange={(v) => onChange({ ...value, name: v })} />
      <Input label="Phone number" type="tel" placeholder="Enter your phone number" value={value.phone} onChange={(v) => onChange({ ...value, phone: v })} />

      <div className="grid grid-cols-2 gap-4">
        <Select label="Date to come" placeholder="Select date" value={value.date} onChange={(v) => onChange({ ...value, date: v })}>
          <option value="2024-07-20">20 July 2024</option>
          <option value="2024-07-21">21 July 2024</option>
          <option value="2024-07-22">22 July 2024</option>
        </Select>
        <Select label="Time to come" placeholder="Select time" value={value.time} onChange={(v) => onChange({ ...value, time: v })}>
          <option value="13:00">13:00</option>
          <option value="14:00">14:00</option>
          <option value="19:00">19:00</option>
        </Select>
      </div>

      <Select label="Number of person" placeholder="How many person will attend" value={value.persons} onChange={(v) => onChange({ ...value, persons: v })}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </Select>

      <TextArea label="Notes" placeholder="e.g. Pleas provide 2 baby chair..." value={value.notes} onChange={(v) => onChange({ ...value, notes: v })} />
    </div>
  );
}