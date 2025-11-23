/**
 * File Upload Utility
 * Handles image uploads to Cloudinary with validation
 */

import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for memory storage (we'll upload directly to Cloudinary)
const storage = multer.memoryStorage();

// File filter - only allow PNG and JPG
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PNG and JPG images are allowed.'), false);
  }
};

// Multer upload configuration
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1 * 1024 * 1024 // 1MB max file size
  }
});

/**
 * Upload image buffer to Cloudinary
 * @param {Buffer} buffer - Image file buffer
 * @param {string} folder - Cloudinary folder name
 * @returns {Promise<string>} - Cloudinary URL
 */
export async function uploadToCloudinary(buffer, folder = 'route-icons') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [
          { width: 128, height: 128, crop: 'limit' }, // Max 128x128
          { quality: 'auto' }, // Auto quality optimization
          { fetch_format: 'auto' } // Auto format (WebP when supported)
        ]
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Delete image from Cloudinary
 * @param {string} url - Cloudinary URL to delete
 */
export async function deleteFromCloudinary(url) {
  try {
    // Extract public_id from URL
    const parts = url.split('/');
    const filename = parts[parts.length - 1].split('.')[0];
    const folder = parts[parts.length - 2];
    const publicId = `${folder}/${filename}`;

    await cloudinary.uploader.destroy(publicId);
    console.log(`🗑️  Deleted image: ${publicId}`);
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
  }
}
