// backend/services/cloudinary.service.js
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload image buffer to Cloudinary
 * @param {Buffer} imageBuffer - Image binary data
 * @param {string} publicId - Public ID for the image (usually productId)
 * @param {Object} options - Additional upload options
 * @returns {Promise<Object>} Cloudinary upload result with secure_url
 */
export async function uploadImageToCloudinary(imageBuffer, publicId, options = {}) {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      public_id: `products/${publicId}`, // Organize in 'products' folder
      folder: 'qr-menu', // Root folder for all QR menu images
      resource_type: 'image',
      overwrite: true, // Overwrite if exists
      // Don't set format - let Cloudinary auto-detect from image data
      quality: 'auto', // Auto-optimize quality
      fetch_format: 'auto', // Serve modern formats when supported (WebP, AVIF, etc.)
      ...options
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          console.error(`[CLOUDINARY] Upload failed for ${publicId}:`, error.message);
          reject(error);
        } else {
          console.log(`[CLOUDINARY] ✅ Uploaded ${publicId} -> ${result.secure_url}`);
          resolve({
            public_id: result.public_id,
            secure_url: result.secure_url,
            url: result.url,
            width: result.width,
            height: result.height,
            format: result.format,
            bytes: result.bytes,
            created_at: result.created_at
          });
        }
      }
    );

    // Upload buffer as stream
    uploadStream.end(imageBuffer);
  });
}

/**
 * Get Cloudinary URL for a product (if already uploaded)
 * @param {string} publicId - Public ID (productId)
 * @returns {string|null} Cloudinary URL or null
 */
export function getCloudinaryUrl(publicId, options = {}) {
  if (!publicId) return null;
  
  try {
    return cloudinary.url(`qr-menu/products/${publicId}`, {
      secure: true,
      fetch_format: 'auto', // Auto-serve WebP/AVIF when supported
      quality: 'auto', // Auto-optimize quality
      width: options.width || 400, // Default smaller size for faster loading
      height: options.height || 300,
      crop: 'fill', // Fill crop for consistent sizing
      ...options
    });
  } catch (error) {
    console.error(`[CLOUDINARY] Failed to generate URL for ${publicId}:`, error.message);
    return null;
  }
}

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Public ID (productId)
 * @returns {Promise<Object>} Deletion result
 */
export async function deleteImageFromCloudinary(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(`qr-menu/products/${publicId}`);
    console.log(`[CLOUDINARY] Deleted ${publicId}:`, result);
    return result;
  } catch (error) {
    console.error(`[CLOUDINARY] Failed to delete ${publicId}:`, error.message);
    throw error;
  }
}

/**
 * Check if Cloudinary is configured
 * @returns {boolean}
 */
export function isCloudinaryConfigured() {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Apply Cloudinary transformations to an existing Cloudinary URL
 * Optimizes images with format auto, quality auto, and size constraints
 * @param {string} cloudinaryUrl - Existing Cloudinary URL
 * @param {Object} options - Transformation options (width, height, etc.)
 * @returns {string} Transformed Cloudinary URL
 */
export function applyCloudinaryTransformations(cloudinaryUrl, options = {}) {
  if (!cloudinaryUrl || typeof cloudinaryUrl !== 'string') {
    return cloudinaryUrl;
  }

  // If it's not a Cloudinary URL, return as-is
  if (!cloudinaryUrl.includes('cloudinary.com')) {
    return cloudinaryUrl;
  }

  try {
    // Extract the path from the URL (everything after /upload/)
    const uploadIndex = cloudinaryUrl.indexOf('/upload/');
    if (uploadIndex === -1) {
      return cloudinaryUrl; // Not a standard Cloudinary URL format
    }

    const baseUrl = cloudinaryUrl.substring(0, uploadIndex + '/upload/'.length);
    const pathAfterUpload = cloudinaryUrl.substring(uploadIndex + '/upload/'.length);

    // Default transformations: optimized for fast loading
    const width = options.width || 400;
    const height = options.height || 300;
    const transformations = [
      `w_${width}`,
      `h_${height}`,
      `c_fill`, // Fill crop for consistent sizing
      `f_auto`, // Auto format (WebP/AVIF when supported - much smaller files)
      `q_auto:good`, // Good quality (faster than 'auto', still looks great)
    ];

    // Build transformed URL
    const transformationString = transformations.join(',');
    return `${baseUrl}${transformationString}/${pathAfterUpload}`;
  } catch (error) {
    console.error(`[CLOUDINARY] Failed to apply transformations to URL:`, error.message);
    return cloudinaryUrl; // Return original URL on error
  }
}

/**
 * Generate a blur-up placeholder thumbnail URL (INSTANT LOADING - like Medium, Pinterest)
 * Creates a tiny (20x20px) blurred thumbnail that loads in milliseconds
 * @param {string} cloudinaryUrl - Original Cloudinary URL
 * @returns {string} Blur-up thumbnail URL (tiny, blurred, low quality - loads instantly)
 */
export function generateBlurUpThumbnail(cloudinaryUrl) {
  if (!cloudinaryUrl || typeof cloudinaryUrl !== 'string') {
    return null;
  }

  // If it's not a Cloudinary URL, return null
  if (!cloudinaryUrl.includes('cloudinary.com')) {
    return null;
  }

  try {
    // Extract the path from the URL (everything after /upload/)
    const uploadIndex = cloudinaryUrl.indexOf('/upload/');
    if (uploadIndex === -1) {
      return null; // Not a standard Cloudinary URL format
    }

    const baseUrl = cloudinaryUrl.substring(0, uploadIndex + '/upload/'.length);
    const pathAfterUpload = cloudinaryUrl.substring(uploadIndex + '/upload/'.length);

    // Generate tiny blurred thumbnail (10x10px, blur effect, very low quality)
    // This loads in milliseconds (~0.5-1KB) and provides instant visual feedback
    // Smaller size = faster loading for impatient customers
    const thumbnailTransformations = [
      'w_10',           // Ultra-tiny width (10px) - loads even faster
      'h_10',           // Ultra-tiny height (10px)
      'c_fill',         // Fill crop
      'e_blur:400',     // Heavy blur effect (400px blur radius)
      'q_auto:low',     // Very low quality (smallest file size)
      'f_auto',         // Auto format (WebP when supported)
    ];

    const thumbnailString = thumbnailTransformations.join(',');
    return `${baseUrl}${thumbnailString}/${pathAfterUpload}`;
  } catch (error) {
    console.error(`[CLOUDINARY] Failed to generate blur-up thumbnail:`, error.message);
    return null;
  }
}

