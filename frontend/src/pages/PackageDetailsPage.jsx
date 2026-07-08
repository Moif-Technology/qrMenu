// frontend/src/pages/PackageDetailsPage.jsx
// Page to show package contents when a package is clicked

import { useEffect, useState, useRef, useMemo, Fragment } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { getPackageDetails, getPackageContents } from "../services/package.service";
import { getImageMapping } from "../services/menu.service";
import Icon from "../component/Icon";
import ItemCard from "../component/ItemCard";

export default function PackageDetailsPage() {
  const { packageId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [packageDetails, setPackageDetails] = useState(null);
  const [packageContents, setPackageContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Image mapping ref (like MenuPage)
  const imageMappingRef = useRef({});
  
  // Check if we came from packages page
  const fromPackages = location.state?.fromPackages;

  // Group items by GroupLabel (choice sections) keeping first-appearance order.
  // Items without a label go to the plain "Included Items" list.
  const grouped = useMemo(() => {
    const sections = [];
    const byLabel = new Map();
    const ungrouped = [];
    for (const item of packageContents) {
      const label = (item.GroupLabel || "").trim();
      if (!label) {
        ungrouped.push(item);
        continue;
      }
      if (!byLabel.has(label)) {
        const section = { label, items: [] };
        byLabel.set(label, section);
        sections.push(section);
      }
      byLabel.get(label).items.push(item);
    }
    return { sections, ungrouped };
  }, [packageContents]);
  
  // Load image mapping on mount (same as MenuPage)
  useEffect(() => {
    (async () => {
      try {
        const mapping = await getImageMapping();
        imageMappingRef.current = mapping;
      } catch (err) {
        console.error("[PACKAGE] Failed to load image mapping:", err);
      }
    })();
  }, []);

  useEffect(() => {
    loadPackageData();
  }, [packageId]);

  const loadPackageData = async () => {
    try {
      setLoading(true);
      setError("");
      
      const [details, contents] = await Promise.all([
        getPackageDetails(packageId),
        getPackageContents(packageId),
      ]);
      
      if (!details) {
        setError("Package not found");
        return;
      }
      
      setPackageDetails(details);
      
      // Apply images from mapping to contents (same as MenuPage)
      const contentsWithImages = (contents || []).map((item, index) => {
        const productId = String(item.ProductID);
        const imageInfo = imageMappingRef.current[productId];
        if (imageInfo && typeof imageInfo === 'object' && imageInfo.cloudinaryUrl) {
          const cloudinaryUrl = String(imageInfo.cloudinaryUrl).trim();
          if (cloudinaryUrl && 
              cloudinaryUrl !== "null" && 
              cloudinaryUrl !== "undefined" &&
              (cloudinaryUrl.startsWith('http://') || cloudinaryUrl.startsWith('https://'))) {
            return {
              ...item,
              cloudinaryUrl: cloudinaryUrl,
              thumbnailUrl: imageInfo.thumbnailUrl || null
            };
          }
        }
        return item;
      });
      
      setPackageContents(contentsWithImages);
    } catch (err) {
      console.error("[PACKAGE-DETAILS] Error loading package:", err);
      setError("Failed to load package details");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
            <div 
              className="absolute inset-0 border-4 border-transparent border-t-[var(--grad-start)] border-r-[var(--grad-end)] rounded-full animate-spin"
            ></div>
          </div>
          <p className="text-sm font-medium text-gray-700">Loading package...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="text-red-500 mb-4">
            <Icon name="alert-circle" className="w-16 h-16 mx-auto" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="btn"
          >
            <Icon name="arrow-left" className="w-5 h-5 mr-2" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!packageDetails) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Back Button */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
          <button
            onClick={() => {
              if (fromPackages && location.state?.subgroupId) {
                // Store the subgroup to return to
                sessionStorage.setItem('returnToSubgroup', location.state.subgroupId);
                sessionStorage.setItem('returnToPackages', 'true');
              }
              // Always go back in history
              navigate(-1);
            }}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition"
          >
            <Icon name="arrow-left" className="w-5 h-5" />
            <span className="font-medium">{fromPackages ? 'Back to Packages' : 'Back to Menu'}</span>
          </button>
        </div>
      </div>

      {/* Simple Package Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                {packageDetails.Description}
              </h1>
              {packageDetails.Specification && (
                <p className="text-sm text-gray-600 mb-2">
                  {packageDetails.Specification}
                </p>
              )}
              <p className="text-sm text-gray-500">
                {packageContents.length} {packageContents.length === 1 ? 'item' : 'items'} included
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl md:text-4xl font-bold text-gray-900">
                {(packageDetails.price || 0).toFixed(0)} <span className="text-xl text-gray-500">AED</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Package Items */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {packageContents.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
            <p className="text-gray-500">No items in this package yet.</p>
          </div>
        )}

        {/* Choice Sections (poster style: label + items with OR between) */}
        {grouped.sections.map((section) => (
          <div key={section.label} className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-amber-300"></div>
              <h2 className="text-center text-sm sm:text-base font-bold uppercase tracking-wide text-amber-800">
                {section.label}
              </h2>
              <div className="h-px flex-1 bg-amber-300"></div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {section.items.map((item, idx) => (
                <Fragment key={item.ProductID || idx}>
                  {idx > 0 && (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-700 text-[10px] font-bold text-white shadow">
                      OR
                    </span>
                  )}
                  <div className="w-32 sm:w-40 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    {item.cloudinaryUrl ? (
                      <img
                        src={item.thumbnailUrl || item.cloudinaryUrl}
                        alt={item.Description}
                        className="h-20 sm:h-24 w-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                    <div className="px-2 py-2 text-center">
                      <p className="text-xs sm:text-sm font-semibold text-gray-900 leading-snug">
                        {item.Description}
                      </p>
                    </div>
                  </div>
                </Fragment>
              ))}
            </div>
          </div>
        ))}

        {/* Plain included items (no choice group) */}
        {grouped.ungrouped.length > 0 && (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              Included Items:
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {grouped.ungrouped.map((item, index) => {
              // Transform the package item to match ItemCard's expected format
              const itemForCard = {
                id: item.ProductID,
                name: item.Description,
                desc: item.ShortDescription || item.Specification,
                subtitle: item.ShortDescription,
                img: item.cloudinaryUrl,
                images: item.cloudinaryUrl ? [item.cloudinaryUrl] : [],
                price: item.price || 0,
                _raw: {
                  ProductID: item.ProductID,
                  "pm.Description": item.Description,
                  "pm.ShortDescription": item.ShortDescription,
                  "pc.UnitPrice": item.unitPrice || 0,
                  "pc.Tax1Amount": item.tax1Amount || 0,
                  DocImage: item.cloudinaryUrl,
                }
              };

              return (
                <ItemCard
                  key={item.ProductID || index}
                  item={itemForCard}
                  onOpen={() => {}}
                  qtyInCart={0}
                />
              );
              })}
            </div>
          </>
        )}
      </div>

      {/* Spacer for bottom padding */}
      <div className="h-8"></div>
    </div>
  );
}

