// frontend/src/pages/PackageDetailsPage.jsx
// Page to show package contents when a package is clicked

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getPackageDetails, getPackageContents } from "../services/package.service";
import { useCart } from "../store/cartStore";
import { useTranslation } from "react-i18next";
import Icon from "../component/Icon";

const COMMON_IMAGE =
  import.meta?.env?.VITE_MENU_IMG ||
  "https://res.cloudinary.com/danoolbdz/image/upload/v1766755726/no-image-icon-23500_j6y6gn.jpg";

export default function PackageDetailsPage() {
  const { packageId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const add = useCart((s) => s.add);
  
  const [packageDetails, setPackageDetails] = useState(null);
  const [packageContents, setPackageContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageLoaded, setImageLoaded] = useState(false);

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
      setPackageContents(contents || []);
    } catch (err) {
      console.error("[PACKAGE-DETAILS] Error loading package:", err);
      setError("Failed to load package details");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = () => {
    if (!packageDetails) return;
    
    // Add package as a single item
    const packageItem = {
      id: packageDetails.ProductID,
      name: packageDetails.Description,
      price: packageDetails.price || 0,
      desc: packageDetails.Specification || packageDetails.ShortDescription || "",
      img: packageDetails.cloudinaryUrl || COMMON_IMAGE,
      _raw: packageDetails,
    };
    
    add(packageItem, []);
    
    // Show success feedback (optional)
    alert(`${packageDetails.Description} added to cart!`);
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

  const imageUrl = packageDetails.cloudinaryUrl || COMMON_IMAGE;
  const hasRealImage = imageUrl && imageUrl !== COMMON_IMAGE;
  const initial = (packageDetails.Description || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with Back Button */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition"
          >
            <Icon name="arrow-left" className="w-5 h-5" />
            <span className="font-medium">Back to Packages</span>
          </button>
        </div>
      </div>

      {/* Package Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Package Image */}
            <div className="md:w-1/3">
              <div className="relative aspect-square rounded-2xl overflow-hidden shadow-xl">
                {hasRealImage ? (
                  <img
                    src={imageUrl}
                    alt={packageDetails.Description}
                    loading="eager"
                    onLoad={() => setImageLoaded(true)}
                    className={`w-full h-full object-cover transition-opacity duration-300 ${
                      imageLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                ) : (
                  <div className="w-full h-full grid place-items-center bg-gradient-to-br from-rose-100 via-pink-50 to-amber-50">
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className="grid h-24 w-24 place-items-center rounded-2xl text-3xl font-bold text-white shadow-2xl"
                        style={{
                          background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                        }}
                      >
                        {initial}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Package Badge */}
                <div className="absolute top-4 left-4 flex items-center gap-2 rounded-full border border-white/80 bg-white/95 backdrop-blur-md px-3 py-1.5 shadow-lg">
                  <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="text-xs font-bold text-gray-800 uppercase">Package</span>
                </div>
              </div>
            </div>

            {/* Package Info */}
            <div className="md:w-2/3">
              <h1 
                className="text-3xl md:text-4xl font-black mb-4"
                style={{ 
                  background: "linear-gradient(120deg, var(--grad-start), var(--grad-end))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text"
                }}
              >
                {packageDetails.Description}
              </h1>
              
              {packageDetails.Specification && (
                <p className="text-lg text-gray-600 leading-relaxed mb-6">
                  {packageDetails.Specification}
                </p>
              )}

              {/* Item Count */}
              <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-amber-50 border border-amber-200 px-4 py-2">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span className="text-sm font-bold text-amber-800">
                  Includes {packageContents.length} {packageContents.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">
                  Total Package Price
                </div>
                <div className="flex items-baseline gap-2">
                  <span 
                    className="text-5xl font-black"
                    style={{ 
                      background: "linear-gradient(120deg, var(--grad-start), var(--grad-end))",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text"
                    }}
                  >
                    {(packageDetails.price || 0).toFixed(0)}
                  </span>
                  <span className="text-2xl font-bold text-gray-400">AED</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Package Contents */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Package Includes:
        </h2>

        {packageContents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <p className="text-gray-500">No items in this package yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {packageContents.map((item, index) => (
              <div
                key={item.ProductID || index}
                className="bg-white rounded-2xl border border-gray-200 p-5 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Number Badge */}
                  <div 
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg"
                    style={{
                      background: "linear-gradient(135deg, var(--grad-start), var(--grad-end))",
                    }}
                  >
                    {index + 1}
                  </div>

                  {/* Item Info */}
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      {item.Description}
                    </h3>
                    {item.ShortDescription && (
                      <p className="text-sm text-gray-600">
                        {item.ShortDescription}
                      </p>
                    )}
                  </div>

                  {/* Checkmark */}
                  <div className="flex-shrink-0">
                    <svg className="w-6 h-6 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fixed Bottom Add to Cart Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-2xl z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Total Price
              </div>
              <div 
                className="text-2xl font-black"
                style={{ 
                  background: "linear-gradient(120deg, var(--grad-start), var(--grad-end))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text"
                }}
              >
                AED {(packageDetails.price || 0).toFixed(2)}
              </div>
            </div>
            
            <button
              onClick={handleAddToCart}
              className="btn flex items-center gap-2 text-lg py-4 px-8"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Add Package to Cart</span>
            </button>
          </div>
        </div>
      </div>

      {/* Spacer to prevent content from being hidden by fixed bar */}
      <div className="h-24"></div>
    </div>
  );
}

