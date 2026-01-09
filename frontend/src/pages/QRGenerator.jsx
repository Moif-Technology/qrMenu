// frontend/src/pages/QRGenerator.jsx
import { useState, useEffect } from "react";
import { generateQRCode } from "../services/qr.service";
import { getAreas } from "../services/menu.service";
import { getTablesByArea } from "../services/table.service";
import { Download, QrCode, Loader2, Copy, Check } from "lucide-react";

export default function QRGenerator() {
  const [tableId, setTableId] = useState("");
  const [tableNo, setTableNo] = useState(""); // Store table number for download filename
  const [area, setArea] = useState("");
  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [loadingAreas, setLoadingAreas] = useState(true);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [qrData, setQrData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);

  // Fetch areas on component mount
  useEffect(() => {
    const fetchAreas = async () => {
      try {
        setLoadingAreas(true);
        const data = await getAreas();
        setAreas(data || []);
      } catch (err) {
        console.error("Failed to fetch areas:", err);
        setError("Failed to load areas. Please refresh the page.");
      } finally {
        setLoadingAreas(false);
      }
    };

    fetchAreas();
  }, []);

  // Fetch tables when area changes
  useEffect(() => {
    const fetchTables = async () => {
      if (!area) {
        setTables([]);
        setTableId("");
        return;
      }

      // Find the selected area object to get areaId
      const selectedAreaObj = areas.find(a => a.areaName === area);
      if (!selectedAreaObj || !selectedAreaObj.areaId) {
        setTables([]);
        setTableId("");
        return;
      }

      try {
        setLoadingTables(true);
        setTableId(""); // Reset table selection when area changes
        setTableNo(""); // Reset table number when area changes
        setError(""); // Clear any previous errors
        const tablesData = await getTablesByArea(selectedAreaObj.areaId);
        setTables(tablesData || []);
      } catch (err) {
        console.error("Failed to fetch tables:", err);
        setError("Failed to load tables for selected area.");
        setTables([]);
      } finally {
        setLoadingTables(false);
      }
    };

    fetchTables();
  }, [area, areas]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    
    if (!tableId.trim()) {
      setError("Table ID is required");
      return;
    }

    if (!area || !area.trim()) {
      setError("Please select an area");
      return;
    }

    setLoading(true);
    setError("");
    setQrData(null);
    setCopied(false);
    setCopiedImage(false);
    
    // Ensure tableNo is set if not already set
    if (!tableNo && tableId) {
      const selectedTable = tables.find(t => String(t.id) === tableId);
      if (selectedTable) {
        setTableNo(selectedTable.number || selectedTable.id);
      }
    }

    const selectedArea = area.trim() || (areas.length > 0 ? areas[0].areaName : "DININ");
    
    try {
      const result = await generateQRCode(tableId.trim(), selectedArea);
      
      if (result.ok) {
        setQrData(result);
      } else {
        setError(result.error || "Failed to generate QR code");
      }
    } catch (err) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!qrData?.qrCode) return;

    const link = document.createElement("a");
    link.href = qrData.qrCode;
    // Use table number for filename instead of table ID
    const fileName = tableNo ? `qr_table_${tableNo}.png` : `qr_table_${qrData.tableId}.png`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopyUrl = async () => {
    if (!qrData?.url) return;

    // Check if Clipboard API is available
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(qrData.url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
      } catch (err) {
        console.error("Failed to copy URL with Clipboard API:", err);
      }
    }

    // Fallback: Use execCommand for older browsers or non-HTTPS contexts
    try {
      const textArea = document.createElement("textarea");
      textArea.value = qrData.url;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      
      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error("execCommand('copy') returned false");
      }
    } catch (err) {
      console.error("Failed to copy URL with fallback method:", err);
      // Last resort: show the URL in an alert so user can manually copy
      alert(`Please copy this URL manually:\n\n${qrData.url}`);
    }
  };

  const handleCopyQRCode = async () => {
    if (!qrData?.qrCode) return;

    // Check if Clipboard API with image support is available
    if (navigator.clipboard && navigator.clipboard.write && ClipboardItem) {
      try {
        // Convert base64 data URL to blob
        const response = await fetch(qrData.qrCode);
        const blob = await response.blob();
        
        // Copy image to clipboard
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob
          })
        ]);
        
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 2000);
        return;
      } catch (err) {
        console.error("Failed to copy QR code image with Clipboard API:", err);
      }
    }

    // Fallback: Try to copy the data URL as text
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(qrData.qrCode);
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 2000);
        alert("QR code data URL copied to clipboard. You can paste it into image editors that support data URLs.");
        return;
      } catch (err) {
        console.error("Failed to copy QR code as text:", err);
      }
    }

    // Fallback: Use execCommand to copy data URL
    try {
      const textArea = document.createElement("textarea");
      textArea.value = qrData.qrCode;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      
      if (successful) {
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 2000);
        alert("QR code data URL copied to clipboard. You can paste it into image editors that support data URLs.");
      } else {
        throw new Error("execCommand('copy') returned false");
      }
    } catch (err) {
      console.error("Failed to copy QR code with fallback method:", err);
      // Last resort: trigger download instead
      alert("Unable to copy QR code to clipboard. Downloading the image instead...");
      handleDownload();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-[var(--grad-start)] to-[var(--grad-end)] rounded-2xl mb-4">
            <QrCode className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">QR Code Generator</h1>
          <p className="text-gray-600">Generate QR codes for your tables</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-8">
          {/* Form */}
          <form onSubmit={handleGenerate} className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Area Selector - First */}
              <div>
                <label htmlFor="area" className="block text-sm font-medium text-gray-700 mb-2">
                  Area <span className="text-red-500">*</span>
                </label>
                {loadingAreas ? (
                  <div className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-50 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-gray-500 text-sm">Loading areas...</span>
                  </div>
                ) : (
                  <select
                    id="area"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--grad-end)] focus:border-transparent transition bg-white"
                    disabled={loading || areas.length === 0}
                  >
                    <option value="">Select an area</option>
                    {areas.length === 0 ? (
                      <option value="">No areas available</option>
                    ) : (
                      areas.map((areaItem) => (
                        <option key={areaItem.areaId} value={areaItem.areaName}>
                          {areaItem.areaName}
                        </option>
                      ))
                    )}
                  </select>
                )}
                {!loadingAreas && areas.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {areas.length} dine-in area{areas.length !== 1 ? "s" : ""} available
                  </p>
                )}
              </div>

              {/* Table ID Selector - Second, depends on area */}
              <div>
                <label htmlFor="tableId" className="block text-sm font-medium text-gray-700 mb-2">
                  Table ID <span className="text-red-500">*</span>
                </label>
                {!area ? (
                  <div className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-50 text-gray-500 text-sm">
                    Please select an area first
                  </div>
                ) : loadingTables ? (
                  <div className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-50 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    <span className="text-gray-500 text-sm">Loading tables...</span>
                  </div>
                ) : (
                  <select
                    id="tableId"
                    value={tableId}
                    onChange={(e) => {
                      const selectedTableId = e.target.value;
                      setTableId(selectedTableId);
                      // Find the selected table to get its number
                      const selectedTable = tables.find(t => String(t.id) === selectedTableId);
                      setTableNo(selectedTable ? (selectedTable.number || selectedTable.id) : "");
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--grad-end)] focus:border-transparent transition bg-white"
                    disabled={loading || !area || tables.length === 0}
                  >
                    <option value="">Select a table</option>
                    {tables.length === 0 ? (
                      <option value="">No tables available</option>
                    ) : (
                      tables.map((table) => (
                        <option key={table.id} value={String(table.id)}>
                          {table.name || `Table ${table.number || table.id}`}
                          {table.capacity ? ` (${table.capacity} seats)` : ""}
                          {table.status === 'Occupied' ? ' - Occupied' : ''}
                        </option>
                      ))
                    )}
                  </select>
                )}
                {!loadingTables && area && tables.length > 0 && (
                  <p className="mt-1 text-xs text-gray-500">
                    {tables.length} table{tables.length !== 1 ? "s" : ""} available in this area
                  </p>
                )}
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn w-full md:w-auto min-w-[200px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <QrCode className="w-5 h-5 mr-2" />
                  Generate QR Code
                </>
              )}
            </button>
          </form>

          {/* QR Code Display */}
          {qrData && (
            <div className="border-t border-gray-200 pt-8">
              <div className="text-center">
                <div className="inline-block p-4 bg-white rounded-2xl shadow-lg mb-6 relative group">
                  <img
                    src={qrData.qrCode}
                    alt={`QR Code for Table ${qrData.tableId}`}
                    className="w-64 h-64 md:w-80 md:h-80"
                  />
                  <button
                    onClick={handleCopyQRCode}
                    className="absolute top-2 right-2 btn-pill px-3 py-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Copy QR Code Image"
                  >
                    {copiedImage ? (
                      <>
                        <Check className="w-3 h-3 mr-1" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-1" />
                        Copy
                      </>
                    )}
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm text-gray-600 mb-1">Table ID</p>
                    <p className="text-lg font-semibold text-gray-900">{qrData.tableId}</p>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm text-gray-600 mb-1">Area</p>
                    <p className="text-lg font-semibold text-gray-900">{qrData.area}</p>
                  </div>

                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm text-gray-600 mb-2">URL</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={qrData.url}
                        readOnly
                        className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--grad-end)]"
                      />
                      <button
                        onClick={handleCopyUrl}
                        className="btn-pill px-4 py-2 text-sm"
                        title="Copy URL"
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                   
                    <button
                      onClick={handleDownload}
                      className="btn-outline inline-flex items-center gap-2"
                    >
                      <Download className="w-5 h-5" />
                      Download QR Code
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">How it works</h3>
          <ul className="space-y-2 text-blue-800 text-sm">
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>First select an Area from the dropdown, then choose a Table ID from the filtered list (only DINE IN areas are shown)</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Click "Generate QR Code" to create a QR code for the table</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Scan the QR code or share the URL to access the table's menu</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Download the QR code image to print or share</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
